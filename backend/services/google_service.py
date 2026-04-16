"""
google_service.py - Enrich cemetery data using Google Places API.

Strategy:
  1. Use Places Text Search to find a matching place near known coordinates.
  2. Validate the result: name similarity check + distance check.
  3. If valid, extract phone, website, and opening hours.

Requires: GOOGLE_PLACES_API_KEY environment variable.
"""

import os
import re
import math
import requests
from difflib import SequenceMatcher

GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place"
API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY', '')

# Maximum distance (km) between OSM location and Google result to accept match
MAX_DISTANCE_KM = 0.5

# Minimum name similarity ratio to accept a match (0-1)
MIN_NAME_SIMILARITY = 0.5


def _haversine(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two lat/lon points."""
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _name_similarity(name1, name2):
    """Return similarity ratio between two strings (0.0 to 1.0)."""
    n1 = re.sub(r'[^\w\s]', '', name1.lower().strip())
    n2 = re.sub(r'[^\w\s]', '', name2.lower().strip())
    return SequenceMatcher(None, n1, n2).ratio()


def _text_search(query, lat, lon):
    """
    Call Google Places Text Search API.
    Returns list of place candidates.
    """
    if not API_KEY:
        return []

    params = {
        'query': query,
        'location': f"{lat},{lon}",
        'radius': 500,          # Search within 500m
        'type': 'cemetery',
        'key': API_KEY,
    }

    try:
        response = requests.get(
            f"{GOOGLE_PLACES_BASE}/textsearch/json",
            params=params,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        if data.get('status') not in ('OK', 'ZERO_RESULTS'):
            print(f"[Google] Text search error: {data.get('status')} - {data.get('error_message', '')}")
            return []

        return data.get('results', [])
    except requests.RequestException as e:
        print(f"[Google] Request error: {e}")
        return []


def _get_place_details(place_id):
    """
    Fetch detailed info for a place by its Google place_id.
    Returns dict with phone, website, opening_hours or None.
    """
    if not API_KEY:
        return None

    params = {
        'place_id': place_id,
        'fields': 'name,formatted_phone_number,website,opening_hours,formatted_address',
        'key': API_KEY,
    }

    try:
        response = requests.get(
            f"{GOOGLE_PLACES_BASE}/details/json",
            params=params,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        if data.get('status') != 'OK':
            return None

        result = data.get('result', {})
        hours_text = None

        oh = result.get('opening_hours', {})
        if oh.get('weekday_text'):
            hours_text = '; '.join(oh['weekday_text'])

        return {
            'phone': result.get('formatted_phone_number', ''),
            'website': result.get('website', ''),
            'opening_hours': hours_text or '',
            'address': result.get('formatted_address', ''),
            'google_name': result.get('name', ''),
        }
    except requests.RequestException as e:
        print(f"[Google] Details error: {e}")
        return None


def enrich_with_google(cemetery_name, lat, lon):
    """
    Try to find matching Google Places entry for a cemetery and return enriched data.

    Args:
        cemetery_name: Name of the cemetery from OSM
        lat, lon: Coordinates

    Returns:
        Dict with phone, website, opening_hours, address — or None if no match found.
    """
    if not API_KEY:
        print("[Google] No API key configured. Skipping Google enrichment.")
        return None

    query = f"{cemetery_name} cemetery"
    candidates = _text_search(query, lat, lon)

    for candidate in candidates:
        g_name = candidate.get('name', '')
        g_lat = candidate['geometry']['location']['lat']
        g_lon = candidate['geometry']['location']['lng']

        # Validate: check distance
        dist = _haversine(lat, lon, g_lat, g_lon)
        if dist > MAX_DISTANCE_KM:
            continue  # Too far — likely wrong place

        # Validate: check name similarity
        similarity = _name_similarity(cemetery_name, g_name)
        if similarity < MIN_NAME_SIMILARITY:
            # Also check if key words overlap (e.g., "Memorial" or "Cemetery")
            name_words = set(cemetery_name.lower().split())
            g_words = set(g_name.lower().split())
            overlap = name_words & g_words
            significant = {w for w in overlap if len(w) > 3}
            if not significant:
                continue  # Not a match

        # Get full details
        place_id = candidate.get('place_id')
        if not place_id:
            continue

        details = _get_place_details(place_id)
        if details:
            print(f"[Google] ✅ Matched '{cemetery_name}' → '{g_name}' (dist={dist:.2f}km, sim={similarity:.2f})")
            return details

    print(f"[Google] ✗ No match for '{cemetery_name}' near ({lat:.4f}, {lon:.4f})")
    return None
