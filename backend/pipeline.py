"""
pipeline.py - Standalone data collection pipeline script.

Usage:
    python pipeline.py --state "Texas" --enrich
    python pipeline.py --all               # Collect all 50 states (slow!)
    python pipeline.py --state "California" --no-enrich  # OSM only
"""

import argparse
import sys
import time
import urllib.parse
from dotenv import load_dotenv
import os

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pymongo import MongoClient
from services.osm_service import fetch_cemeteries_by_state, STATE_NAMES
from services.google_service import enrich_with_google

MONGO_URI = os.getenv("MONGO_URI")
ALLOWED_TYPES = {"cemetery", "graveyard"}


def get_collection():
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    db = client["Cemetery_algson"]
    return db["Cemetery_data"]


# ── Source merge helpers ──────────────────────────────────────────────────────

def _findagrave_search_url(name, state):
    """
    Build a Find A Grave memorial search URL for a cemetery name + state.

    This is a SEARCH URL — not a direct page link — so it never points to
    incorrect data. The user reaches a search results page and can navigate
    from there. No scraping, no guessing, no picking the first result.
    """
    query = urllib.parse.quote_plus(f"{name} {state}".strip())
    return f"https://www.findagrave.com/search?query={query}"


def _merge_google_data(cemetery, google_data):
    """
    Merge Google Places data into a cemetery record.

    ── phone ──────────────────────────────────────────────────────────────────
    Real Google phone always wins over OSM (Google is authoritative for
    business contact data). "Not Available" (meaning Google matched but had
    no phone) is stored only when the cemetery has no phone from any prior
    source — it does NOT overwrite a valid OSM phone number.

    ── website ────────────────────────────────────────────────────────────────
    Real Google URL -> store as official, source = "Google".
    Google matched but no URL, AND cemetery has no website ->
      generate a Find A Grave search URL:
        website_source = "FindAGrave"
        website_type   = "search_fallback"
    This is a search link, never a guessed official URL.

    ── opening_hours ──────────────────────────────────────────────────────────
    Google is the only authorised source for hours. Same "Not Available"
    sentinel logic as phone: stored only to fill an empty slot, never to
    overwrite existing OSM hours data.

    ── address fields (gap-fill only) ─────────────────────────────────────────
    address, city, county, state, zip_code: written only when still empty
    after OSM+Nominatim have already had priority.

    ── source fields ──────────────────────────────────────────────────────────
    Every written contact field gets a corresponding _source field so the
    database records provenance explicitly.

    Updates cemetery in-place.
    Returns True if any field was written, False otherwise.
    """
    if not google_data:
        return False

    written = False

    # ── phone ──────────────────────────────────────────────────────────────────
    google_phone = google_data.get("phone", "")
    if google_phone and google_phone != "Not Available":
        # Real phone from Google — always wins.
        cemetery["phone"] = google_phone
        cemetery["phone_source"] = google_data.get("phone_source", "Google")
        written = True
    elif not cemetery.get("phone"):
        # Google confirmed no phone; record verified absence rather than leaving blank.
        cemetery["phone"] = "Not Available"
        cemetery["phone_source"] = google_data.get("phone_source", "Google")
        written = True
    # else: cemetery already has a phone from OSM — do NOT overwrite with "Not Available".

    # ── website ────────────────────────────────────────────────────────────────
    google_website = google_data.get("website", "")
    if google_website:
        # Verified official URL from Google.
        cemetery["website"] = google_website
        cemetery["website_source"] = "Google"
        cemetery["website_type"] = "official"
        written = True
    elif not cemetery.get("website"):
        # No website from Google or any prior source -> FindAGrave search fallback.
        cemetery["website"] = _findagrave_search_url(
            cemetery.get("name", ""), cemetery.get("state", "")
        )
        cemetery["website_source"] = "FindAGrave"
        cemetery["website_type"] = "search_fallback"
        written = True
    # else: cemetery already has a website from OSM — keep it.

    # ── opening_hours ──────────────────────────────────────────────────────────
    google_hours = google_data.get("opening_hours", "")
    if google_hours and google_hours != "Not Available":
        # Real hours from Google — always wins.
        cemetery["opening_hours"] = google_hours
        cemetery["hours_source"] = google_data.get("hours_source", "Google")
        written = True
    elif not cemetery.get("opening_hours"):
        # Google confirmed no hours; record verified absence.
        cemetery["opening_hours"] = "Not Available"
        cemetery["hours_source"] = google_data.get("hours_source", "Google")
        written = True
    # else: cemetery has OSM hours — do NOT overwrite with "Not Available".

    # ── address fields (gap-fill only) ─────────────────────────────────────────
    for field in ("address", "city", "county", "state", "zip_code"):
        if not cemetery.get(field) and google_data.get(field):
            cemetery[field] = google_data[field]
            written = True

    return written


def _record_source(cemetery, source):
    """
    Append a source tag to data_source without duplicating.
    Result is alphabetically sorted, e.g. "Google+Nominatim+OSM".
    """
    parts = set(cemetery.get("data_source", "OSM").split("+"))
    parts.add(source)
    cemetery["data_source"] = "+".join(sorted(parts))


# ── Pipeline ──────────────────────────────────────────────────────────────────

def process_state(state_name, enrich=False, collection=None, limit=None):
    """Fetch and store cemeteries for one state."""
    print(f"\n{'=' * 60}")
    print(f"  Processing: {state_name}")
    print(f"{'=' * 60}")

    max_items = limit or 50

    try:
        cemeteries = fetch_cemeteries_by_state(state_name, enrich_address=True)
        if max_items:
            cemeteries = cemeteries[:max_items]
    except Exception as e:
        print(f"[ERROR] Failed to fetch {state_name}: {e}")
        return 0, 0

    inserted = 0
    skipped = 0

    for cemetery in cemeteries:
        try:
            coords = cemetery.get("location", {}).get("coordinates", [])
            if len(coords) == 2:
                lon, lat = coords[0], coords[1]
            else:
                lat, lon = None, None

            if enrich and lat and lon:
                try:
                    google_data = enrich_with_google(cemetery["name"], lat, lon)

                    if google_data:
                        # Valid Google match: merge contact data + gap-fill address.
                        contributed = _merge_google_data(cemetery, google_data)
                        if contributed:
                            _record_source(cemetery, "Google")
                    else:
                        # No Google match: apply FindAGrave fallback if no website exists.
                        # Hours and phone are left empty (no verified source to draw from).
                        if not cemetery.get("website"):
                            cemetery["website"] = _findagrave_search_url(
                                cemetery.get("name", ""), cemetery.get("state", "")
                            )
                            cemetery["website_source"] = "FindAGrave"
                            cemetery["website_type"] = "search_fallback"

                except Exception as e:
                    print(f"[Google Warning] {e}")

                time.sleep(0.3)

            # Fixed constant — not a fallback for missing data.
            cemetery["country"] = "United States"
            cemetery["type"] = (
                cemetery.get("type")
                if str(cemetery.get("type", "")).strip().lower() in ALLOWED_TYPES
                else "cemetery"
            )

            if not cemetery.get("osm_id"):
                skipped += 1
                continue

            result = collection.update_one(
                {"osm_id": cemetery["osm_id"]},
                {"$set": cemetery},
                upsert=True,
            )

            if result.upserted_id:
                inserted += 1
            else:
                skipped += 1

            if (inserted + skipped) % 50 == 0:
                print(
                    f"  Progress: {inserted + skipped}/{len(cemeteries)} | "
                    f"Inserted: {inserted} | Skipped: {skipped}"
                )

        except Exception as e:
            print(f"[WARN] Failed to store '{cemetery.get('name', 'unknown')}': {e}")

    print(f"  ✅ Done: {inserted} inserted, {skipped} skipped (total: {len(cemeteries)})")
    return inserted, skipped


def main():
    parser = argparse.ArgumentParser(description="Cemetery Data Collection Pipeline")
    parser.add_argument("--state", type=str, help='State name to collect (e.g., "Texas")')
    parser.add_argument("--all", action="store_true", help="Collect all 50 states")
    parser.add_argument("--enrich", action="store_true", help="Enrich with Google Places API")
    parser.add_argument("--no-enrich", action="store_true", help="OSM only, skip Google")
    parser.add_argument("--limit", type=int, help="Limit number of cemeteries per state")
    args = parser.parse_args()

    enrich = args.enrich and not args.no_enrich

    print("Cemetery Data Collection Pipeline")
    print("   MongoDB: configured")
    print(f"   Google enrichment: {'ON' if enrich else 'OFF'}")

    collection = get_collection()

    if args.all:
        states = STATE_NAMES
        print(f"\nCollecting all {len(states)} states...")
        total_inserted = 0
        total_skipped = 0

        for state in states:
            ins, skip = process_state(state, enrich=enrich, collection=collection, limit=args.limit)
            total_inserted += ins
            total_skipped += skip
            time.sleep(2)

        print(f"\nComplete! Total inserted: {total_inserted}, skipped: {total_skipped}")

    elif args.state:
        process_state(args.state, enrich=enrich, collection=collection, limit=args.limit)

    else:
        parser.print_help()
        print("\nExamples:")
        print("  python pipeline.py --state 'Texas'")
        print("  python pipeline.py --state 'California' --enrich")
        print("  python pipeline.py --all")


if __name__ == "__main__":
    main()