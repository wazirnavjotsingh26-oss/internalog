"""
google_service.py - Enrich cemetery data using Google Places API.

Strategy:
  1. Text Search near known coordinates.
  2. Strict validation: distance AND name similarity both required.
     Relaxed name threshold permitted ONLY when Google's own place types
     confirm the candidate is a cemetery. Distance cap is never relaxed.
  3. Among all valid candidates, pick the highest-scoring match.
  4. Extract phone, website, hours; missing contact fields -> "Not Available".

Requires: GOOGLE_PLACES_API_KEY environment variable.
"""

import os
import re
import math
import requests
from difflib import SequenceMatcher

GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place"
API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")

# Distance cap — never relaxed regardless of name match quality.
MAX_DISTANCE_KM = 2.0

# Standard name similarity threshold.
MIN_NAME_SIMILARITY = 0.5

# Relaxed similarity — only applied when Google's types list includes "cemetery".
# This is the ONLY controlled relaxation; no other heuristics are permitted.
MIN_NAME_SIMILARITY_CEMETERY_TYPE = 0.3

GOOGLE_URL_RE = re.compile(
    r"^https?://(www\.)?(google\.[^/]+|maps\.google\.[^/]+)", re.IGNORECASE
)


# ── Math helpers ──────────────────────────────────────────────────────────────

def _haversine(lat1, lon1, lat2, lon2):
    """Distance in km between two lat/lon points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def _name_similarity(name1, name2):
    """Normalised similarity ratio (0.0–1.0)."""
    n1 = re.sub(r"[^\w\s]", "", name1.lower().strip())
    n2 = re.sub(r"[^\w\s]", "", name2.lower().strip())
    return SequenceMatcher(None, n1, n2).ratio()


# ── Matching validation ───────────────────────────────────────────────────────

def _validate_match(osm_name, g_name, osm_lat, osm_lon, g_lat, g_lon, g_types=None):
    """
    Two-gate validation. Distance is always strict (≤ MAX_DISTANCE_KM).

    Name similarity gate:
      - Standard threshold (0.5) applies by default.
      - Relaxed threshold (0.3) applies ONLY when Google's place types list
        explicitly includes "cemetery" — Google itself categorises the result
        as a cemetery, providing an independent semantic signal.

    This is the ONLY relaxation permitted. No word-overlap bypass, no other
    heuristics. If either gate fails, the candidate is rejected.

    Args:
        g_types: list of Google place type strings from the candidate, e.g.
                 ["cemetery", "establishment", "point_of_interest"]

    Returns:
        (is_valid: bool, distance_km: float, similarity: float)
    """
    dist = _haversine(osm_lat, osm_lon, g_lat, g_lon)
    sim = _name_similarity(osm_name, g_name)

    if dist > MAX_DISTANCE_KM:
        return False, dist, sim

    has_cemetery_type = "cemetery" in set(g_types or [])
    min_sim = MIN_NAME_SIMILARITY_CEMETERY_TYPE if has_cemetery_type else MIN_NAME_SIMILARITY

    valid = sim >= min_sim
    return valid, dist, sim


def _match_score(dist, sim):
    """Composite score: 70 % name similarity + 30 % proximity."""
    proximity = max(0.0, (MAX_DISTANCE_KM - dist) / MAX_DISTANCE_KM)
    return sim * 0.7 + proximity * 0.3


# ── Google API calls ──────────────────────────────────────────────────────────

def _text_search(query, lat, lon):
    """Return candidate place results from Google Places Text Search."""
    if not API_KEY:
        return []

    params = {
        "query": query,
        "location": f"{lat},{lon}",
        "radius": 500,
        "type": "cemetery",
        "key": API_KEY,
    }

    try:
        response = requests.get(
            f"{GOOGLE_PLACES_BASE}/textsearch/json",
            params=params,
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            print(f"[Google] Text search error: {data.get('status')}")
            return []

        return data.get("results", [])
    except requests.RequestException:
        print("[Google] Request error during text search.")
        return []


def _get_place_details(place_id):
    """
    Fetch full details for a Google place_id.

    Returns a dict with raw field values (empty string when absent), or None
    on API failure. The "Not Available" sentinel is NOT applied here — that
    is applied by enrich_with_google after a successful match is confirmed.
    """
    if not API_KEY:
        return None

    params = {
        "place_id": place_id,
        "fields": (
            "name,formatted_phone_number,website,opening_hours,"
            "formatted_address,address_components"
        ),
        "key": API_KEY,
    }

    try:
        response = requests.get(
            f"{GOOGLE_PLACES_BASE}/details/json",
            params=params,
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "OK":
            return None

        result = data.get("result", {})

        oh = result.get("opening_hours", {})
        hours_text = "; ".join(oh["weekday_text"]) if oh.get("weekday_text") else ""

        components = result.get("address_components", [])

        def _component(*wanted_types):
            wanted = set(wanted_types)
            for item in components:
                if wanted & set(item.get("types") or []):
                    return item.get("long_name", "")
            return ""

        website = result.get("website", "") or ""
        if website and GOOGLE_URL_RE.search(website):
            website = ""

        return {
            "phone": result.get("formatted_phone_number", ""),
            "website": website,
            "opening_hours": hours_text,
            "address": result.get("formatted_address", ""),
            "google_name": result.get("name", ""),
            "city": _component("locality", "postal_town", "administrative_area_level_3"),
            "county": _component("administrative_area_level_2"),
            "state": _component("administrative_area_level_1"),
            "zip_code": _component("postal_code"),
        }
    except requests.RequestException:
        print("[Google] Request error during details lookup.")
        return None


# ── Public API ────────────────────────────────────────────────────────────────

def enrich_with_google(cemetery_name, lat, lon):
    """
    Find the best-matching Google Places entry for a cemetery.

    Contact fields (phone, opening_hours) that Google does not provide for a
    confirmed match are returned as "Not Available" — indicating a verified
    absence rather than an unknown. Website is returned as an empty string
    when absent; the pipeline applies the FindAGrave search fallback.

    Source tracking fields (phone_source, hours_source) are included in the
    returned dict so callers can record provenance explicitly.

    Returns a details dict, or None if no valid match is found.
    """
    if not API_KEY:
        print("[Google] No API key configured. Skipping.")
        return None

    query = f"{cemetery_name} cemetery"
    candidates = _text_search(query, lat, lon)

    best_details = None
    best_score = -1.0

    for candidate in candidates:
        g_name = candidate.get("name", "")
        g_geo = candidate.get("geometry", {}).get("location", {})
        g_lat = g_geo.get("lat")
        g_lon = g_geo.get("lng")
        # Pass Google's own type tags to allow the controlled similarity relaxation.
        g_types = candidate.get("types", [])

        if g_lat is None or g_lon is None:
            continue

        valid, dist, sim = _validate_match(
            cemetery_name, g_name, lat, lon, g_lat, g_lon, g_types
        )
        if not valid:
            continue

        place_id = candidate.get("place_id")
        if not place_id:
            continue

        details = _get_place_details(place_id)
        if not details:
            continue

        score = _match_score(dist, sim)
        if score > best_score:
            best_score = score
            best_details = (details, g_name, dist, sim)

    if best_details:
        details, g_name, dist, sim = best_details

        # Apply "Not Available" for contact fields confirmed absent by Google.
        # Website is intentionally left as "" — the pipeline sets FindAGrave.
        if not details.get("phone"):
            details["phone"] = "Not Available"
        if not details.get("opening_hours"):
            details["opening_hours"] = "Not Available"

        # Source tracking — callers must use these keys, not infer provenance.
        details["phone_source"] = "Google"
        details["hours_source"] = "Google"

        print(
            f"[Google] ✅ Matched '{cemetery_name}' → '{g_name}' "
            f"(dist={dist:.2f}km, sim={sim:.2f})"
        )
        return details

    print(f"[Google] ✗ No match for '{cemetery_name}' near ({lat:.4f}, {lon:.4f})")
    return None