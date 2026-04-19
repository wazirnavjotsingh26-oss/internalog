import requests
import time
try:
    from backend.services.geocode_service import reverse_geocode
except ImportError:  # pragma: no cover
    from services.geocode_service import reverse_geocode

# Multiple Overpass API endpoints (fallback system)
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]


def fallback_google_search_link(cemetery):
    name = cemetery.get("name") or "Cemetery"
    location_hint = cemetery.get("city") or cemetery.get("county") or cemetery.get("state") or "United States"
    query = "+".join(
        str(part).strip().replace(" ", "+")
        for part in (name, location_hint, "cemetery")
        if part
    )
    return f"https://www.google.com/search?q={query}"


def city_from_address_parts(address_text):
    if not address_text:
        return ""
    parts = [part.strip() for part in str(address_text).split(",") if part.strip()]
    for part in parts:
        if any(char.isdigit() for char in part):
            continue
        lowered = part.lower()
        if lowered in {"united states", "usa"}:
            continue
        if len(part) <= 2:
            continue
        return part
    return ""


def clean_display_address(address_text):
    if not address_text:
        return ""
    parts = [part.strip() for part in str(address_text).split(",") if part.strip()]
    if len(parts) >= 4:
        return ", ".join(parts[:3])
    if len(parts) >= 3:
        return ", ".join(parts[:3])
    return ", ".join(parts[:2]) if len(parts) >= 2 else (parts[0] if parts else "")

# 🔥 All US States List
STATE_NAMES = [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
    "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
    "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
    "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
    "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
]

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
    tags = element.get('tags', {})

    # Get name
    name = tags.get('name') or tags.get('alt_name') or "Unknown Cemetery"

    # Get coordinates
    lat = element.get('lat')
    lon = element.get('lon')

    if lat is None or lon is None:
        center = element.get('center')
        if center:
            lat = center.get('lat')
            lon = center.get('lon')

    # FINAL CHECK
    if lat is None or lon is None:
        print("[SKIP] No lat/lon:", element)
        return None

    # Determine type
    if tags.get("amenity") == "grave_yard":
        cemetery_type = "graveyard"
    elif tags.get("landuse") == "cemetery":
        cemetery_type = "cemetery"
    else:
        cemetery_type = "unknown"
    access = tags.get('access', '').lower()
    ownership = tags.get('ownership', '').lower()

    if access == 'public' or ownership == 'public':
        cemetery_type = 'public'
    elif access == 'private' or ownership == 'private':
        cemetery_type = 'private'
    elif 'memorial' in name.lower():
        cemetery_type = 'memorial'

    return {
        'name': name,
        'country': 'United States',
        'address': tags.get('addr:street', ''),
        'city': tags.get('addr:city', ''),
        'county': tags.get('addr:county', ''),
        'state': state_name,
        'zip_code': tags.get('addr:postcode', ''),

    # ✅ ADD THESE (IMPORTANT)
        'latitude': lat,
        'longitude': lon,

        'location': {
            "type": "Point",
            "coordinates": [lon, lat]
        },

        'phone': tags.get('phone') or tags.get('contact:phone', ''),
        'website': tags.get('website') or tags.get('contact:website', ''),
        'opening_hours': tags.get('opening_hours', ''),
        'type': cemetery_type,
        'labels': ['Cemetery'],
        'notes': '',
        'data_source': 'OSM',
        'osm_id': str(element.get('id', '')),
        'osm_type': element.get('type', ''),
    }

def fetch_cemeteries_by_state(state_name, enrich_address=False):
    query = build_overpass_query_by_area(state_name)

    print(f"[OSM] Fetching cemeteries for {state_name}...")

    data = None

    # 🔥 Retry + fallback logic
    for url in OVERPASS_URLS:
        for attempt in range(3):
            try:
                print(f"[OSM] Trying {url} (Attempt {attempt+1})")

                response = requests.post(
                    url,
                    data={'data': query},
                    timeout=120,
                    headers={'User-Agent': 'CemeteryDataSystem/1.0'}
                )
                response.raise_for_status()

                data = response.json()
                print(f"[OSM] Success from {url}")
                break

            except Exception as e:
                print(f"[Retry {attempt+1}] Failed: {e}")
                time.sleep(2)

        if data:
            break

    if not data:
        raise RuntimeError("All Overpass API endpoints failed.")

    elements = data.get('elements', [])
    elements = elements[:50]
    print(f"[OSM] Found {len(elements)} raw elements for {state_name}")

    for element in elements[:3]:
        print(element)

    cemeteries = []

    for i, element in enumerate(elements):
        
        cemetery = parse_element(element, state_name)


        if not cemetery:
            continue

        try:
        # SAFE COORDS
            location = cemetery.get('location')
            if not location:
                continue

            coords = location.get('coordinates')
            if not coords or len(coords) != 2:
                continue

            lon, lat = coords

        # GEO ENRICHMENT
            if enrich_address:
                geo_data = reverse_geocode(lat, lon)
                time.sleep(1.2)

                if geo_data:
                    if geo_data.get('city'):
                        cemetery['city'] = geo_data.get('city', '')
                    elif not cemetery.get('city'):
                        cemetery['city'] = city_from_address_parts(cemetery.get('address', ''))

                    if geo_data.get('county'):
                        cemetery['county'] = geo_data.get('county', '')
                    if geo_data.get('zip_code'):
                        cemetery['zip_code'] = geo_data.get('zip_code', '')

                    full_address = geo_data.get('address', '')
                    if full_address:
                        cemetery['address'] = clean_display_address(full_address)

            if not cemetery.get('city'):
                cemetery['city'] = cemetery.get('county') or "Unknown"
            if not cemetery.get('phone'):
                cemetery['phone'] = "Not Available"
            if not cemetery.get('opening_hours'):
                cemetery['opening_hours'] = "Not Available"
            if not cemetery.get('website'):
                cemetery['website'] = fallback_google_search_link(cemetery)

            cemeteries.append(cemetery)

        except Exception as e:
            print("⚠️ Error processing:", e)
            continue

    print(f"[OSM] Parsed {len(cemeteries)} cemeteries for {state_name}")
    return cemeteries

