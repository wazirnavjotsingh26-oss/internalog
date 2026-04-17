"""
routes.py - All Flask API endpoints for the Cemetery Data System
"""

from collections import deque
from datetime import datetime, timezone
from functools import wraps
from io import StringIO
import csv
import os
import re
import threading
import time

from bson import ObjectId
from flask import Response, g, jsonify, request, session
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

try:
    from backend.db import get_collection
    from backend.services.google_service import enrich_with_google
    from backend.services.osm_service import fetch_cemeteries_by_state
except ImportError:  # pragma: no cover
    # Allow running as a script: `python backend/app.py`
    from db import get_collection
    from services.google_service import enrich_with_google
    from services.osm_service import fetch_cemeteries_by_state


ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
SETTINGS_COLLECTION = "app_settings"
SETTINGS_DOC_ID = "admin_settings"
COLLECT_JOBS_COLLECTION = "collect_jobs"
API_LOG_LIMIT = 250
DEFAULT_COUNTRY = "United States"


def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict."""
    if not doc:
        return None
    result = dict(doc)
    if "_id" in result:
        result["_id"] = str(result["_id"])
    return result


def register_routes(app):
    app.config.setdefault("API_LOGS", deque(maxlen=API_LOG_LIMIT))
    token_serializer = URLSafeTimedSerializer(app.secret_key, salt="admin-auth")

    if app.config.get("IS_PRODUCTION"):
        if ADMIN_PASSWORD == "admin123" or len(ADMIN_PASSWORD.strip()) < 12:
            raise RuntimeError(
                "Set a strong ADMIN_PASSWORD (min 12 chars, not default) when APP_ENV=production."
            )

    def build_website_fallback(doc):
        name = (doc.get("name") or "Cemetery").strip()
        location_hint = (
            doc.get("city")
            or doc.get("county")
            or doc.get("state")
            or DEFAULT_COUNTRY
        )
        query = "+".join(
            str(part).strip().replace(" ", "+")
            for part in (name, location_hint, "cemetery")
            if part
        )
        return f"https://www.google.com/search?q={query}"

    def to_bounded_int(value, default, minimum=None, maximum=None):
        """Parse integer safely with optional bounds."""
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default
        if minimum is not None:
            parsed = max(minimum, parsed)
        if maximum is not None:
            parsed = min(maximum, parsed)
        return parsed

    def apply_record_fallbacks(doc):
        clean = dict(doc or {})

        if not clean.get("city"):
            clean["city"] = clean.get("county") or "Unknown"
        if not clean.get("phone"):
            clean["phone"] = "Not Available"
        if not clean.get("opening_hours"):
            clean["opening_hours"] = "Not Available"
        if not clean.get("website"):
            clean["website"] = build_website_fallback(clean)

        return clean

    def settings_collection():
        return get_collection().database[SETTINGS_COLLECTION]

    def default_settings():
        return {
            "google_places_enabled": bool(os.environ.get("GOOGLE_PLACES_API_KEY")),
            "auto_clean_enabled": False,
            "allow_public_exports": True,
            "default_collection_limit": 200,
            "collection_batch_note": "OSM base import with optional Google enrichment",
            "updated_at": None,
        }

    def get_settings_document():
        doc = settings_collection().find_one({"_id": SETTINGS_DOC_ID}) or {}
        merged = default_settings()
        merged.update({k: v for k, v in doc.items() if k != "_id"})
        return merged

    def save_settings(data):
        clean = default_settings()
        clean.update(
            {
                "google_places_enabled": bool(data.get("google_places_enabled")),
                "auto_clean_enabled": bool(data.get("auto_clean_enabled")),
                "allow_public_exports": bool(data.get("allow_public_exports", True)),
                "default_collection_limit": to_bounded_int(
                    data.get("default_collection_limit", 200),
                    default=200,
                    minimum=1,
                    maximum=5000,
                ),
                "collection_batch_note": str(data.get("collection_batch_note", "")).strip(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        settings_collection().update_one(
            {"_id": SETTINGS_DOC_ID},
            {"$set": clean},
            upsert=True,
        )
        return clean

    def issue_admin_token():
        return token_serializer.dumps({"role": "admin"})

    def is_valid_admin_token(token):
        if not token:
            return False
        try:
            payload = token_serializer.loads(token, max_age=60 * 60 * 24 * 7)
            return payload.get("role") == "admin"
        except (BadSignature, SignatureExpired):
            return False

    def extract_bearer_token():
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.lower().startswith("bearer "):
            return ""
        return auth_header.split(" ", 1)[1].strip()

    def is_admin():
        if bool(session.get("admin_logged_in")):
            return True
        return is_valid_admin_token(extract_bearer_token())

    def admin_required(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not is_admin():
                return jsonify({"error": "Admin login required"}), 401
            return view(*args, **kwargs)

        return wrapped

    def build_filters(args):
        filters = {}
        and_filters = []
        country = (args.get("country") or "").strip()
        state = (args.get("state") or "").strip()
        city = (args.get("city") or "").strip()
        county = (args.get("county") or "").strip()
        cemetery_type = (args.get("type") or "").strip()
        search = (args.get("search") or "").strip()
        country_pattern = re.escape(country)
        state_pattern = re.escape(state)
        city_pattern = re.escape(city)
        county_pattern = re.escape(county)
        type_pattern = re.escape(cemetery_type)

        if country:
            if country.lower() == DEFAULT_COUNTRY.lower():
                and_filters.append(
                    {
                        "$or": [
                            {"country": {"$regex": f"^{country_pattern}$", "$options": "i"}},
                            {"country": {"$exists": False}},
                            {"country": None},
                            {"country": ""},
                        ]
                    }
                )
            else:
                and_filters.append({"country": {"$regex": f"^{country_pattern}$", "$options": "i"}})
        if state:
            and_filters.append({"state": {"$regex": f"^{state_pattern}$", "$options": "i"}})
        if city:
            and_filters.append({"city": {"$regex": f"^{city_pattern}$", "$options": "i"}})
        if county:
            and_filters.append({"county": {"$regex": f"^{county_pattern}$", "$options": "i"}})
        if cemetery_type:
            and_filters.append({"type": {"$regex": f"^{type_pattern}$", "$options": "i"}})
        if search:
            and_filters.append(
                {
                    "$or": [
                        {"name": {"$regex": search, "$options": "i"}},
                        {"city": {"$regex": search, "$options": "i"}},
                        {"county": {"$regex": search, "$options": "i"}},
                        {"state": {"$regex": search, "$options": "i"}},
                        {"country": {"$regex": search, "$options": "i"}},
                    ]
                }
            )
        if not and_filters:
            return filters
        if len(and_filters) == 1:
            return and_filters[0]
        return {"$and": and_filters}

    def normalize_cemetery_payload(data, *, partial=False):
        payload = dict(data or {})
        payload.pop("_id", None)

        for key in (
            "name",
            "address",
            "city",
            "county",
            "country",
            "state",
            "zip_code",
            "phone",
            "website",
            "type",
            "opening_hours",
            "notes",
        ):
            if key in payload and payload[key] is not None:
                payload[key] = str(payload[key]).strip()

        for key in ("latitude", "longitude"):
            if key in payload:
                val = payload.get(key)
                if val in (None, ""):
                    payload[key] = None
                else:
                    try:
                        payload[key] = float(val)
                    except (TypeError, ValueError):
                        if partial:
                            payload.pop(key, None)
                        else:
                            payload[key] = None

        lat = payload.get("latitude")
        lon = payload.get("longitude")
        if lat is not None and lon is not None:
            payload["location"] = {"type": "Point", "coordinates": [lon, lat]}
        elif not partial and ("latitude" in payload or "longitude" in payload):
            payload["location"] = None

        if not partial:
            payload = apply_record_fallbacks(payload)

        return payload

    def completeness_percentage(doc):
        fields = [
            "name",
            "address",
            "city",
            "county",
            "state",
            "zip_code",
            "phone",
            "website",
            "opening_hours",
            "type",
        ]
        filled = sum(1 for field in fields if doc.get(field))
        return round((filled / len(fields)) * 100)

    def parse_iso_datetime(value):
        if not value:
            return None
        try:
            text = str(value).strip()
            if not text:
                return None
            if text.endswith("Z"):
                text = text[:-1] + "+00:00"
            parsed = datetime.fromisoformat(text)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            return None

    def get_last_entry_metadata(collection):
        latest_candidates = []

        latest_updated = collection.find_one(
            {"updated_at": {"$type": "string", "$nin": ["", None]}},
            {"updated_at": 1, "name": 1, "state": 1},
            sort=[("updated_at", -1)],
        )
        if latest_updated:
            updated_dt = parse_iso_datetime(latest_updated.get("updated_at"))
            if updated_dt:
                latest_candidates.append(
                    {
                        "dt": updated_dt,
                        "source": "updated_at",
                        "name": latest_updated.get("name"),
                        "state": latest_updated.get("state"),
                    }
                )

        latest_created = collection.find_one(
            {"created_at": {"$type": "string", "$nin": ["", None]}},
            {"created_at": 1, "name": 1, "state": 1},
            sort=[("created_at", -1)],
        )
        if latest_created:
            created_dt = parse_iso_datetime(latest_created.get("created_at"))
            if created_dt:
                latest_candidates.append(
                    {
                        "dt": created_dt,
                        "source": "created_at",
                        "name": latest_created.get("name"),
                        "state": latest_created.get("state"),
                    }
                )

        latest_object_id_doc = collection.find_one({}, {"name": 1, "state": 1}, sort=[("_id", -1)])
        if latest_object_id_doc and latest_object_id_doc.get("_id"):
            oid_dt = latest_object_id_doc["_id"].generation_time.astimezone(timezone.utc)
            latest_candidates.append(
                {
                    "dt": oid_dt,
                    "source": "object_id",
                    "name": latest_object_id_doc.get("name"),
                    "state": latest_object_id_doc.get("state"),
                }
            )

        if not latest_candidates:
            return {
                "last_entry_at": None,
                "last_entry_source": None,
                "last_entry_name": None,
                "last_entry_state": None,
            }

        latest = max(latest_candidates, key=lambda item: item["dt"])
        return {
            "last_entry_at": latest["dt"].isoformat(),
            "last_entry_source": latest["source"],
            "last_entry_name": latest.get("name"),
            "last_entry_state": latest.get("state"),
        }

    def build_stats():
        collection = get_collection()
        total = collection.count_documents({})
        with_phone = collection.count_documents({"phone": {"$nin": [None, ""]}})
        with_website = collection.count_documents({"website": {"$nin": [None, ""]}})
        with_hours = collection.count_documents({"opening_hours": {"$nin": [None, ""]}})
        with_address = collection.count_documents({"address": {"$nin": [None, ""]}})

        top_states = list(
            collection.aggregate(
                [
                    {"$match": {"state": {"$nin": [None, ""]}}},
                    {"$group": {"_id": "$state", "count": {"$sum": 1}}},
                    {"$sort": {"count": -1, "_id": 1}},
                    {"$limit": 10},
                ]
            )
        )
        by_source = list(
            collection.aggregate(
                [
                    {"$group": {"_id": {"$ifNull": ["$data_source", "Unknown"]}, "count": {"$sum": 1}}},
                    {"$sort": {"count": -1, "_id": 1}},
                ]
            )
        )
        last_entry = get_last_entry_metadata(collection)
        return {
            "total": total,
            "with_phone": with_phone,
            "with_website": with_website,
            "with_hours": with_hours,
            "with_address": with_address,
            "top_states": [{"state": s["_id"], "count": s["count"]} for s in top_states],
            "by_source": [{"source": s["_id"], "count": s["count"]} for s in by_source],
            "last_entry_at": last_entry["last_entry_at"],
            "last_entry_source": last_entry["last_entry_source"],
            "last_entry_name": last_entry["last_entry_name"],
            "last_entry_state": last_entry["last_entry_state"],
        }

    @app.before_request
    def _request_timer():
        g._request_started_at = time.perf_counter()

    @app.after_request
    def _capture_api_log(response):
        try:
            if request.path.startswith("/api/") or request.path.startswith("/admin/"):
                started = getattr(g, "_request_started_at", time.perf_counter())
                latency_ms = round((time.perf_counter() - started) * 1000, 2)
                app.config["API_LOGS"].appendleft(
                    {
                        "time": datetime.now().strftime("%H:%M:%S"),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "method": request.method,
                        "path": request.full_path.rstrip("?"),
                        "status": response.status_code,
                        "ms": latency_ms,
                    }
                )
        except Exception:
            app.logger.exception("Failed to store API log entry")
        return response

    @app.route("/admin/login", methods=["POST"])
    def admin_login():
        data = request.get_json(silent=True) or request.form or {}
        password = data.get("password", "")
        if password == ADMIN_PASSWORD:
            session["admin_logged_in"] = True
            return jsonify({"success": True, "token": issue_admin_token()})
        return jsonify({"success": False, "error": "Invalid password"}), 401

    @app.route("/admin/logout")
    def admin_logout():
        session.pop("admin_logged_in", None)
        return jsonify({"success": True})

    @app.route("/api/admin/check", methods=["GET"])
    def admin_check():
        return jsonify({"authenticated": is_admin()})

    @app.route("/api/stats", methods=["GET"])
    def get_stats():
        return jsonify(build_stats())

    @app.route("/api/admin/analytics", methods=["GET"])
    @admin_required
    def get_admin_analytics():
        collection = get_collection()
        stats = build_stats()
        all_docs = list(
            collection.find(
                {},
                {
                    "name": 1,
                    "address": 1,
                    "city": 1,
                    "county": 1,
                    "state": 1,
                    "zip_code": 1,
                    "phone": 1,
                    "website": 1,
                    "opening_hours": 1,
                    "type": 1,
                    "data_source": 1,
                },
            )
        )

        total = len(all_docs) or 1
        field_names = [
            ("Name", "name"),
            ("State", "state"),
            ("City", "city"),
            ("Phone", "phone"),
            ("Website", "website"),
            ("ZIP", "zip_code"),
            ("Hours", "opening_hours"),
        ]
        field_completion = [
            {
                "label": label,
                "pct": round((sum(1 for doc in all_docs if doc.get(field)) / total) * 100),
            }
            for label, field in field_names
        ]

        completeness = [completeness_percentage(doc) for doc in all_docs]
        bands = {
            "complete": sum(1 for pct in completeness if pct >= 80),
            "partial": sum(1 for pct in completeness if 50 <= pct < 80),
            "minimal": sum(1 for pct in completeness if pct < 50),
        }
        health_score = round(sum(completeness) / total) if all_docs else 0

        return jsonify(
            {
                "health_score": health_score,
                "field_completion": field_completion,
                "source_distribution": stats["by_source"],
                "completeness_distribution": bands,
                "top_states": stats["top_states"],
                "totals": stats,
            }
        )

    @app.route("/api/admin/logs", methods=["GET"])
    @admin_required
    def get_api_logs():
        limit = to_bounded_int(
            request.args.get("limit", 100),
            default=100,
            minimum=1,
            maximum=API_LOG_LIMIT,
        )
        return jsonify({"logs": list(app.config["API_LOGS"])[:limit]})

    @app.route("/api/admin/settings", methods=["GET"])
    @admin_required
    def get_admin_settings():
        return jsonify(get_settings_document())

    @app.route("/api/admin/settings", methods=["PUT"])
    @admin_required
    def update_admin_settings():
        payload = request.get_json(silent=True) or {}
        return jsonify({"success": True, "settings": save_settings(payload)})

    @app.route("/api/cemeteries", methods=["GET"])
    def get_cemeteries():
        collection = get_collection()
        filters = build_filters(request.args)

        try:
            limit = min(int(request.args.get("limit", 100)), 500)
            skip = max(int(request.args.get("skip", 0)), 0)
        except ValueError:
            limit = 100
            skip = 0

        total = collection.count_documents(filters)
        docs = list(collection.find(filters).sort("name", 1).skip(skip).limit(limit))
        results = [apply_record_fallbacks(serialize_doc(doc)) for doc in docs]

        return jsonify(
            {
                "total": total,
                "count": len(results),
                "skip": skip,
                "limit": limit,
                "data": results,
            }
        )

    @app.route("/api/cemeteries/<cemetery_id>", methods=["GET"])
    def get_cemetery(cemetery_id):
        collection = get_collection()
        try:
            doc = collection.find_one({"_id": ObjectId(cemetery_id)})
        except Exception:
            return jsonify({"error": "Invalid ID"}), 400
        if not doc:
            return jsonify({"error": "Not found"}), 404
        return jsonify(apply_record_fallbacks(serialize_doc(doc)))

    @app.route("/api/states", methods=["GET"])
    def get_states():
        collection = get_collection()
        filters = build_filters({"country": request.args.get("country", "")})
        states = sorted(collection.distinct("state", filters))
        return jsonify({"states": [state for state in states if state]})

    @app.route("/api/countries", methods=["GET"])
    def get_countries():
        collection = get_collection()
        countries = {country for country in collection.distinct("country") if country}
        countries.add(DEFAULT_COUNTRY)
        return jsonify({"countries": sorted(countries)})

    @app.route("/api/counties", methods=["GET"])
    def get_counties():
        collection = get_collection()
        filters = build_filters(
            {
                "country": request.args.get("country", ""),
                "state": request.args.get("state", ""),
            }
        )
        counties = sorted(collection.distinct("county", filters))
        return jsonify({"counties": [county for county in counties if county]})

    @app.route("/api/cities", methods=["GET"])
    def get_cities():
        collection = get_collection()
        filters = build_filters(
            {
                "country": request.args.get("country", ""),
                "state": request.args.get("state", ""),
                "county": request.args.get("county", ""),
            }
        )
        cities = sorted(collection.distinct("city", filters))
        return jsonify({"cities": [city for city in cities if city]})

    @app.route("/api/export/cemeteries.csv", methods=["GET"])
    def export_cemeteries_csv():
        settings = get_settings_document()
        if not settings.get("allow_public_exports") and not is_admin():
            return jsonify({"error": "Export requires admin access"}), 401

        collection = get_collection()
        filters = build_filters(request.args)
        docs = list(collection.find(filters).sort("state", 1).sort("name", 1))

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "name",
                "address",
                "city",
                "county",
                "country",
                "state",
                "zip_code",
                "latitude",
                "longitude",
                "phone",
                "website",
                "opening_hours",
                "type",
                "data_source",
                "osm_id",
            ]
        )
        for doc in docs:
            writer.writerow(
                [
                    doc.get("name", ""),
                    doc.get("address", ""),
                    doc.get("city", ""),
                    doc.get("county", ""),
                    doc.get("country", DEFAULT_COUNTRY),
                    doc.get("state", ""),
                    doc.get("zip_code", ""),
                    doc.get("latitude", ""),
                    doc.get("longitude", ""),
                    doc.get("phone", ""),
                    doc.get("website", ""),
                    doc.get("opening_hours", ""),
                    doc.get("type", ""),
                    doc.get("data_source", ""),
                    doc.get("osm_id", ""),
                ]
            )

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=cemeteries_export.csv"},
        )

    @app.route("/api/export/counties.csv", methods=["GET"])
    def export_counties_csv():
        settings = get_settings_document()
        if not settings.get("allow_public_exports") and not is_admin():
            return jsonify({"error": "Export requires admin access"}), 401

        collection = get_collection()
        pipeline = [
            {
                "$group": {
                    "_id": {"state": "$state", "county": "$county"},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id.state": 1, "_id.county": 1}},
        ]
        rows = list(collection.aggregate(pipeline))

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["state", "county", "cemetery_count"])
        for row in rows:
            writer.writerow([row["_id"].get("state", ""), row["_id"].get("county", ""), row["count"]])

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=county_export.csv"},
        )

    def get_collect_jobs_collection():
        return get_collection().database[COLLECT_JOBS_COLLECTION]

    def serialize_collect_job(doc):
        if not doc:
            return None
        out = dict(doc)
        out["_id"] = str(out["_id"])
        return out

    def run_state_collection(state, enrich, auto_clean, limit, progress_hook=None):
        """
        Fetch OSM (+ optional Google) records for one state and upsert into Mongo.
        progress_hook(idx, total, counts) called occasionally during the per-record loop.
        """
        collection = get_collection()
        inserted = 0
        updated = 0
        skipped = 0
        errors = []

        cemeteries = fetch_cemeteries_by_state(state, enrich_address=True)
        if limit:
            cemeteries = cemeteries[:limit]
        total = len(cemeteries)

        for idx, cemetery in enumerate(cemeteries, start=1):
            try:
                if enrich and cemetery.get("latitude") and cemetery.get("longitude"):
                    google_data = enrich_with_google(
                        cemetery["name"],
                        cemetery["latitude"],
                        cemetery["longitude"],
                    )
                    if google_data:
                        cemetery["phone"] = google_data.get("phone") or cemetery.get("phone")
                        cemetery["website"] = google_data.get("website") or cemetery.get("website")
                        cemetery["opening_hours"] = (
                            google_data.get("opening_hours") or cemetery.get("opening_hours")
                        )
                        if google_data.get("address"):
                            cemetery["address"] = google_data["address"]
                        cemetery["data_source"] = "Google+OSM"

                if auto_clean:
                    cemetery["name"] = " ".join(str(cemetery.get("name", "")).split())
                    for key in ("address", "city", "county", "state"):
                        if cemetery.get(key):
                            cemetery[key] = str(cemetery[key]).strip()

                cemetery = apply_record_fallbacks(cemetery)

                query = {}
                if cemetery.get("osm_id"):
                    query["osm_id"] = cemetery["osm_id"]
                else:
                    query = {
                        "name": cemetery["name"],
                        "latitude": cemetery.get("latitude"),
                        "longitude": cemetery.get("longitude"),
                    }

                existing = collection.find_one(query, {"_id": 1})
                result = collection.update_one(query, {"$set": cemetery}, upsert=True)
                if result.upserted_id:
                    inserted += 1
                elif existing:
                    updated += 1
                else:
                    skipped += 1
            except Exception as exc:
                errors.append(str(exc))

            if progress_hook and (idx == total or idx % 5 == 0):
                progress_hook(
                    idx,
                    total,
                    {"inserted": inserted, "updated": updated, "skipped": skipped, "errors": len(errors)},
                )

        return {
            "state": state,
            "fetched": total,
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "errors": errors[:10],
        }

    def collect_job_worker(job_id, state, enrich, auto_clean, limit):
        jobs = get_collect_jobs_collection()
        try:

            def on_progress(idx, total, counts):
                jobs.update_one(
                    {"_id": job_id},
                    {
                        "$set": {
                            "updated_at": datetime.now(timezone.utc),
                            "phase": "processing",
                            "progress": {"done": idx, "total": total, **counts},
                        }
                    },
                )

            jobs.update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "updated_at": datetime.now(timezone.utc),
                        "phase": "fetching",
                        "progress": {"done": 0, "total": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": 0},
                    }
                },
            )
            summary = run_state_collection(state, enrich, auto_clean, limit, progress_hook=on_progress)
            jobs.update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "completed",
                        "updated_at": datetime.now(timezone.utc),
                        "phase": "done",
                        "result": summary,
                        "progress": {
                            "done": summary["fetched"],
                            "total": summary["fetched"],
                            "inserted": summary["inserted"],
                            "updated": summary["updated"],
                            "skipped": summary["skipped"],
                            "errors": len(summary.get("errors") or []),
                        },
                    }
                },
            )
        except Exception as exc:
            jobs.update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "failed",
                        "updated_at": datetime.now(timezone.utc),
                        "phase": "error",
                        "error": str(exc),
                    }
                },
            )

    @app.route("/api/collect/jobs/<job_id>", methods=["GET"])
    @admin_required
    def collect_job_status(job_id):
        try:
            oid = ObjectId(job_id)
        except Exception:
            return jsonify({"error": "invalid job id"}), 400
        doc = get_collect_jobs_collection().find_one({"_id": oid})
        if not doc:
            return jsonify({"error": "job not found"}), 404
        return jsonify({"job": serialize_collect_job(doc)})

    @app.route("/api/collect", methods=["GET"])
    def collect_endpoint_info():
        # Opening this URL in a browser sends GET; collection is POST-only.
        return jsonify(
            {
                "endpoint": "/api/collect",
                "message": "Collection is triggered with POST, not GET.",
                "method": "POST",
                "headers": {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer <admin_jwt>",
                },
                "body": {
                    "state": "required (e.g. California)",
                    "enrich": "optional bool",
                    "auto_clean": "optional bool",
                    "limit": "optional int (1–5000)",
                    "async": "optional bool (default true) — returns 202 + job_id",
                },
                "poll": "GET /api/collect/jobs/<job_id> until status is completed or failed",
            }
        )

    @app.route("/api/collect", methods=["POST"])
    @admin_required
    def collect_data():
        data = request.get_json(silent=True) or {}
        state = (data.get("state") or "").strip()
        settings = get_settings_document()
        enrich = bool(data.get("enrich", False)) and settings.get("google_places_enabled", True)
        auto_clean = bool(data.get("auto_clean", settings.get("auto_clean_enabled", False)))
        raw_limit = data.get("limit") or settings.get("default_collection_limit")
        limit = to_bounded_int(raw_limit, default=200, minimum=1, maximum=5000)
        use_async = bool(data.get("async", True))

        if not state:
            return jsonify({"error": "state is required"}), 400

        if use_async:
            jobs = get_collect_jobs_collection()
            job_id = ObjectId()
            now = datetime.now(timezone.utc)
            jobs.insert_one(
                {
                    "_id": job_id,
                    "status": "running",
                    "phase": "queued",
                    "created_at": now,
                    "updated_at": now,
                    "params": {
                        "state": state,
                        "enrich": enrich,
                        "auto_clean": auto_clean,
                        "limit": limit,
                    },
                    "progress": None,
                    "result": None,
                    "error": None,
                }
            )
            thread = threading.Thread(
                target=collect_job_worker,
                args=(job_id, state, enrich, auto_clean, limit),
                daemon=True,
            )
            thread.start()
            return (
                jsonify(
                    {
                        "accepted": True,
                        "job_id": str(job_id),
                        "poll_url": f"/api/collect/jobs/{job_id}",
                    }
                ),
                202,
            )

        try:
            summary = run_state_collection(state, enrich, auto_clean, limit)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

        return jsonify(summary)

    @app.route("/api/cemeteries", methods=["POST"])
    @admin_required
    def create_cemetery():
        collection = get_collection()
        data = request.get_json(silent=True) or {}
        if not data.get("name", "").strip():
            return jsonify({"error": "name is required"}), 400
        if not data.get("state", "").strip():
            return jsonify({"error": "state is required"}), 400

        payload = normalize_cemetery_payload(data)
        payload["country"] = payload.get("country") or DEFAULT_COUNTRY
        payload["data_source"] = payload.get("data_source") or "Manual"
        payload["added_by"] = "admin"
        payload["created_at"] = datetime.now(timezone.utc).isoformat()
        payload = apply_record_fallbacks(payload)
        try:
            result = collection.insert_one(payload)
        except Exception as exc:
            if "duplicate key error" in str(exc).lower():
                return jsonify({"error": "Duplicate cemetery record"}), 409
            raise
        payload["_id"] = str(result.inserted_id)
        return jsonify({"success": True, "cemetery": payload}), 201

    @app.route("/api/cemeteries/<cemetery_id>", methods=["PUT"])
    @admin_required
    def update_cemetery(cemetery_id):
        collection = get_collection()
        data = request.get_json(silent=True) or {}
        payload = normalize_cemetery_payload(data, partial=True)
        if "country" in data and not payload.get("country"):
            payload["country"] = DEFAULT_COUNTRY
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            result = collection.update_one({"_id": ObjectId(cemetery_id)}, {"$set": payload})
        except Exception:
            return jsonify({"error": "Invalid ID or duplicate data"}), 400
        if result.matched_count == 0:
            return jsonify({"error": "Not found"}), 404
        return jsonify({"success": True})

    @app.route("/api/cemeteries/<cemetery_id>", methods=["DELETE"])
    @admin_required
    def delete_cemetery(cemetery_id):
        collection = get_collection()
        try:
            result = collection.delete_one({"_id": ObjectId(cemetery_id)})
        except Exception:
            return jsonify({"error": "Invalid ID"}), 400
        if result.deleted_count == 0:
            return jsonify({"error": "Not found"}), 404
        return jsonify({"success": True})

