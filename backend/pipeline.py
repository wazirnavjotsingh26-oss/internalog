"""
pipeline.py - Standalone data collection pipeline script.

Usage:
    python pipeline.py --state "Texas" --enrich
    python pipeline.py --all               # Collect all 50 states (slow!)
    python pipeline.py --state "California" --no-enrich  # OSM only

This script can be run independently of the Flask app.
"""

import argparse
import sys
import time
from dotenv import load_dotenv
import os

load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pymongo import MongoClient
from services.osm_service import fetch_cemeteries_by_state, STATE_NAMES
from services.google_service import enrich_with_google

MONGO_URI = os.getenv("MONGO_URI")

print("Using Mongo URI:", MONGO_URI)


def get_collection():
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    db = client['Cemetery_algson']
    return db['Cemetery_data']


def process_state(state_name, enrich=False, collection=None, limit=None):
    """Fetch and store cemeteries for one state."""
    print(f"\n{'='*60}")
    print(f"  Processing: {state_name}")
    print(f"{'='*60}")

    try:
        cemeteries = fetch_cemeteries_by_state(state_name, enrich_address=True)

        # 🔥 Apply limit early
        if limit:
            cemeteries = cemeteries[:limit]

    except Exception as e:
        print(f"[ERROR] Failed to fetch {state_name}: {e}")
        return 0, 0

    inserted = 0
    skipped = 0

    for i, cemetery in enumerate(cemeteries):
        try:
            # ✅ Get coordinates safely
            coords = cemetery.get('location', {}).get('coordinates', [])
            if len(coords) == 2:
                lon, lat = coords[0], coords[1]
            else:
                lat, lon = None, None

            # 🔥 OPTIONAL GOOGLE ENRICHMENT
            if enrich and lat and lon:
                if i % 10 == 0:
                    try:
                        google_data = enrich_with_google(
                            cemetery['name'],
                            lat,
                            lon
                        )

                        if google_data:
                            cemetery['phone'] = google_data.get('phone') or cemetery.get('phone', '')
                            cemetery['website'] = google_data.get('website') or cemetery.get('website', '')
                            cemetery['opening_hours'] = google_data.get('opening_hours') or cemetery.get('opening_hours', '')
                            cemetery['data_source'] = 'Google+OSM'

                    except Exception as e:
                        print(f"[Google Warning] {e}")

                    time.sleep(0.3)

            # 🔥 UPSERT (avoid duplicates)
            result = collection.update_one(
            {
                'osm_id': cemetery['osm_id']  # ✅ UNIQUE ID (BEST)
            },
            {'$setOnInsert': cemetery},
            upsert=True
        )

            if result.upserted_id:
                inserted += 1
            else:
                skipped += 1

            # 🔥 Progress log
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
    parser = argparse.ArgumentParser(description='Cemetery Data Collection Pipeline')
    parser.add_argument('--state', type=str, help='State name to collect (e.g., "Texas")')
    parser.add_argument('--all', action='store_true', help='Collect all 50 states')
    parser.add_argument('--enrich', action='store_true', help='Enrich with Google Places API')
    parser.add_argument('--no-enrich', action='store_true', help='OSM only, skip Google')
    parser.add_argument("--limit", type=int, help="Limit number of cemeteries")
    args = parser.parse_args()

    enrich = args.enrich and not args.no_enrich

    print("🪦 Cemetery Data Collection Pipeline")
    print(f"   MongoDB: {MONGO_URI[:40]}...")
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
            time.sleep(2)  # Brief pause between states

        print(f"\n🎉 Complete! Total inserted: {total_inserted}, skipped: {total_skipped}")

    elif args.state:
        process_state(args.state, enrich=enrich, collection=collection, limit=args.limit)

    else:
        parser.print_help()
        print("\nExamples:")
        print("  python pipeline.py --state 'Texas'")
        print("  python pipeline.py --state 'California' --enrich")
        print("  python pipeline.py --all")


if __name__ == '__main__':
    main()
