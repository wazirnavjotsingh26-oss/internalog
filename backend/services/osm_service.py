import re
import requests
import time

try:
    from backend.services.geocode_service import reverse_geocode
except ImportError:
    from services.geocode_service import reverse_geocode

# Multiple Overpass API endpoints (fallback system)
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

STATE_NAMES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
    "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
    "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
    "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
]


# ── Address helpers ───────────────────────────────────────────────────────────

def clean_display_address(address_text):
    """Return the first 3 comma-separated parts of a full display address."""
    if not address_text:
        return ""
    parts = [p.strip() for p in str(address_text).split(",") if p.strip()]
    if len(parts) >= 3:
        return ", ".join(parts[:3])
    if len(parts) == 2:
        return ", ".join(parts)
    return parts[0] if parts else ""


def _clean_county_name(county_text):
    if not county_text:
        return ""
    return re.sub(r"\s+county$", "", str(county_text).strip(), flags=re.IGNORECASE).strip()


def _derive_address_from_tags(tags):
    house = str(tags.get("addr:housenumber", "")).strip()
    street = str(tags.get("addr:street", "")).strip()
    full = " ".join(p for p in (house, street) if p).strip()
    return full or str(tags.get("addr:full", "")).strip()


def _normalize_cemetery_type(tags):
    amenity = str(tags.get("amenity", "")).strip().lower()
    landuse = str(tags.get("landuse", "")).strip().lower()
    if amenity == "grave_yard":
        return "graveyard"
    if landuse == "cemetery":
        return "cemetery"
    return "cemetery"


# Kept for potential use by callers (e.g. routes.py search links).
def fallback_google_search_link(cemetery):
    name = cemetery.get("name") or "Cemetery"
    location_hint = (
        cemetery.get("city")
        or cemetery.get("county")
        or cemetery.get("state")
        or "United States"
    )
    query = "+".join(
        str(part).strip().replace(" ", "+")
        for part in (name, location_hint, "cemetery")
        if part
    )
    return f"https://www.google.com/search?q={query}"


# ── Overpass query ────────────────────────────────────────────────────────────

def build_overpass_query_by_area(state_name):
    return f"""
[out:json][timeout:25];
area["name"="{state_name}"]["boundary"="administrative"]->.searchArea;
(
  node["amenity"="grave_yard"](area.searchArea);
  way["amenity"="grave_yard"](area.searchArea);
  relation["amenity"="grave_yard"](area.searchArea);
  node["landuse"="cemetery"](area.searchArea);
  way["landuse"="cemetery"](area.searchArea);
  relation["landuse"="cemetery"](area.searchArea);
);
out center tags;
"""


def parse_element(element, state_name):
    """
    Parse a raw Overpass element into a cemetery dict.
    All address fields come directly from OSM tags — nothing is inferred or fabricated.
    Returns None if coordinates are missing.
    """
    tags = element.get("tags", {})
    name = tags.get("name") or tags.get("alt_name") or "Unknown Cemetery"

    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        center = element.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")

    if lat is None or lon is None:
        print("[SKIP] No lat/lon:", element)
        return None

    return {
        "name": name,
        "country": "United States",
        "address": _derive_address_from_tags(tags),
        "city": tags.get("addr:city", ""),
        "county": _clean_county_name(tags.get("addr:county", "")),
        "state": state_name,
        "zip_code": tags.get("addr:postcode", ""),
        "latitude": lat,
        "longitude": lon,
        "location": {"type": "Point", "coordinates": [lon, lat]},
        "phone": tags.get("phone") or tags.get("contact:phone", ""),
        "website": tags.get("website") or tags.get("contact:website", ""),
        "opening_hours": tags.get("opening_hours", ""),
        "type": _normalize_cemetery_type(tags),
        "labels": ["Cemetery"],
        "notes": "",
        "data_source": "OSM",
        "osm_id": str(element.get("id", "")),
        "osm_type": element.get("type", ""),
    }


# ── Nominatim enrichment ──────────────────────────────────────────────────────

def _apply_nominatim(cemetery, lat, lon):
    """
    Fill address gaps using Nominatim reverse-geocoding.

    Source priority: OSM tags have already been set by parse_element. This
    function only writes a field when the cemetery record has no value for it
    — it never overwrites data that came from OSM tags.

    Returns True if at least one field was updated.
    """
    geo_data = reverse_geocode(lat, lon)
    if not geo_data:
        return False

    updated = False

    if not cemetery.get("city") and geo_data.get("city"):
        cemetery["city"] = geo_data["city"]
        updated = True

    if not cemetery.get("county") and geo_data.get("county"):
        cemetery["county"] = _clean_county_name(geo_data["county"])
        updated = True

    if not cemetery.get("zip_code") and geo_data.get("zip_code"):
        cemetery["zip_code"] = geo_data["zip_code"]
        updated = True

    if not cemetery.get("address") and geo_data.get("address"):
        cemetery["address"] = clean_display_address(geo_data["address"])
        updated = True

    return updated


# ── Main fetch ────────────────────────────────────────────────────────────────

def fetch_cemeteries_by_state(state_name, enrich_address=False):
    query = build_overpass_query_by_area(state_name)
    print(f"[OSM] Fetching cemeteries for {state_name}...")

    data = None

    for url in OVERPASS_URLS:
        for attempt in range(3):
            try:
                print(f"[OSM] Trying {url} (Attempt {attempt + 1})")
                response = requests.post(
                    url,
                    data={"data": query},
                    timeout=120,
                    headers={"User-Agent": "CemeteryDataSystem/1.0"},
                )
                response.raise_for_status()
                data = response.json()
                print(f"[OSM] Success from {url}")
                break
            except Exception as e:
                print(f"[Retry {attempt + 1}] Failed: {e}")
                time.sleep(2)

        if data:
            break

    if not data:
        raise RuntimeError("All Overpass API endpoints failed.")

    elements = data.get("elements", [])
    elements = elements[:50]
    print(f"[OSM] Found {len(elements)} raw elements for {state_name}")

    for element in elements[:3]:
        print(element)

    cemeteries = []

    for element in elements:
        cemetery = parse_element(element, state_name)
        if not cemetery:
            continue

        coords = cemetery.get("location", {}).get("coordinates", [])
        if len(coords) != 2:
            continue
        lon, lat = coords

        if enrich_address:
            nominatim_contributed = _apply_nominatim(cemetery, lat, lon)
            time.sleep(1.2)
            if nominatim_contributed:
                cemetery["data_source"] = "OSM+Nominatim"

        # Final normalization — no fake data filling; empty strings stay empty.
        cemetery["county"] = _clean_county_name(cemetery.get("county", ""))
        cemetery["country"] = "United States"
        cemetery["state"] = state_name
        cemetery["type"] = (
            cemetery.get("type")
            if cemetery.get("type") in {"cemetery", "graveyard"}
            else "cemetery"
        )

        cemeteries.append(cemetery)

    print(f"[OSM] Parsed {len(cemeteries)} cemeteries for {state_name}")
    return cemeteries