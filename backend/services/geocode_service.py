"""
geocode_service.py - Reverse geocoding using Nominatim (OpenStreetMap).

Nominatim is free and requires no API key, but must be rate-limited to
1 request per second to comply with usage policy.
"""

import requests
import time

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"

# Cache to avoid redundant API calls for nearby coordinates
_geocode_cache = {}


def _cache_key(lat, lon):
    """Round coordinates to ~100m precision for caching."""
    return (round(float(lat), 3), round(float(lon), 3))


import requests

def reverse_geocode(lat, lon):
    url = "https://nominatim.openstreetmap.org/reverse"

    params = {
        "lat": lat,
        "lon": lon,
        "format": "json",
        "addressdetails": 1
    }

    headers = {
        "User-Agent": "cemetery-app"
    }

    try:
        response = requests.get(url, params=params, headers=headers)
        data = response.json()

        address = data.get("address", {})

        return {
            "city": (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("hamlet")
                or ""
            ),
            "county": address.get("county", ""),
            "zip_code": address.get("postcode", ""),
            "address": data.get("display_name", "")
        }

    except Exception as e:
        print("Geo error:", e)
        return None

def forward_geocode(address):
    """
    Forward geocode an address string to lat/lon.
    Returns (lat, lon) tuple or (None, None).
    """
    params = {
        'q': address,
        'format': 'json',
        'limit': 1,
        'countrycodes': 'us',
    }
    headers = {'User-Agent': 'CemeteryDataSystem/1.0'}

    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers=headers,
            timeout=10
        )
        response.raise_for_status()
        results = response.json()
        if results:
            return float(results[0]['lat']), float(results[0]['lon'])
    except Exception as e:
        print(f"[Nominatim Forward] Error: {e}")

    return None, None
