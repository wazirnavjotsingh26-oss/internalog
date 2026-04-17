# ⚜ CemeteryBase — US Cemetery Data System

A production-grade web application for collecting, verifying, storing, and displaying
cemetery data across all 50 US states.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA PIPELINE                           │
│                                                             │
│  OpenStreetMap  →  Nominatim Geocoding  →  Google Places   │
│  (base data)       (address fill)          (enrichment)    │
│                          ↓                                  │
│                    MongoDB Atlas                            │
│                   (cemetery_db)                             │
└─────────────────────────────────────────────────────────────┘
                          ↕ REST API
┌─────────────────────────────────────────────────────────────┐
│                    Flask Backend                             │
│  GET /api/cemeteries   GET /api/states   POST /api/collect  │
└─────────────────────────────────────────────────────────────┘
                          ↕ HTTP
┌─────────────────────────────────────────────────────────────┐
│                      Frontend                               │
│   index.html (Public Directory)   admin.html (Dashboard)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
cemetery_project/
├── backend/
│   ├── app.py              # Flask app factory
│   ├── db.py               # MongoDB connection + indexes
│   ├── routes.py           # All API + page routes
│   ├── pipeline.py         # Standalone data collection script
│   └── services/
│       ├── osm_service.py     # OpenStreetMap / Overpass API
│       ├── geocode_service.py # Nominatim reverse geocoding
│       └── google_service.py  # Google Places enrichment
├── frontend/
│   ├── templates/
│   │   ├── index.html      # Public directory page
│   │   ├── admin.html      # Admin dashboard
│   │   └── admin_login.html
│   └── static/
│       ├── css/
│       │   ├── style.css   # Main styles
│       │   └── admin.css   # Admin-specific styles
│       └── js/
│           ├── app.js      # Public frontend logic
│           └── admin.js    # Admin dashboard logic
├── requirements.txt
├── .env.example
└── README.md
```

---

## 🚀 Setup & Installation

### 1. Clone and create virtual environment

```bash
cd cemetery_project
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment variables

**.env created automatically** (edit MONGO_URI from Atlas)
```
MONGO_URI=...  # Required: https://mongodb.com/atlas (free cluster)
```


Required:
- `MONGO_URI` — MongoDB Atlas connection string

Optional (for enrichment):
- `GOOGLE_PLACES_API_KEY` — Enables phone, website, hours

### 3. Set up MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create a database user
3. Whitelist your IP address (or use `0.0.0.0/0` for development)
4. Copy the connection string into `MONGO_URI` in `.env`

### 4. Run the Flask backend

```bash
cd backend
python app.py
```

The app will be available at `http://localhost:5000`

---

## 🌍 Data Collection

### Via Admin Dashboard (UI)

1. Open `http://localhost:5000/admin`
2. Login with the password from `.env` (default: `admin123`)
3. Go to **Collect Data** tab
4. Select a state and click **Start Collection**

### Via Command Line (Pipeline Script)

```bash
cd backend

# Collect a single state (OSM only)
python pipeline.py --state "Texas"

# Collect with Google enrichment
python pipeline.py --state "California" --enrich

# Collect all 50 states (WARNING: takes several hours)
python pipeline.py --all
```

---

## 🔌 API Reference

### `GET /api/cemeteries`
Returns paginated list of cemeteries.

Query parameters:
| Param   | Description                     | Example        |
|---------|---------------------------------|----------------|
| state   | Filter by state name            | `Texas`        |
| city    | Filter by city name             | `Austin`       |
| county  | Filter by county                | `Travis`       |
| type    | Filter by type                  | `public`       |
| search  | Full-text search on name/city   | `Oakwood`      |
| limit   | Max results (default 100, max 500)| `50`         |
| skip    | Pagination offset               | `100`          |

### `GET /api/cemeteries/<id>`
Returns a single cemetery by MongoDB ID.

### `GET /api/states`
Returns all distinct states in the database.

### `GET /api/cities?state=Texas`
Returns all distinct cities for a state.

### `GET /api/stats`
Returns dashboard statistics.

### `POST /api/collect`
Triggers data collection for a state.
Body: `{ "state": "Texas", "enrich": false }`

### `PUT /api/cemeteries/<id>`
Updates a cemetery record.

### `DELETE /api/cemeteries/<id>`
Deletes a cemetery record.

---

## 📊 Data Schema

Each cemetery document in MongoDB:

```json
{
  "_id": "ObjectId",
  "name": "Oakwood Cemetery",
  "address": "1601 Navasota St",
  "city": "Austin",
  "county": "Travis",
  "state": "Texas",
  "zip_code": "78702",
  "latitude": 30.2671,
  "longitude": -97.7274,
  "phone": "(512) 472-5democracy",
  "website": "https://austintexas.gov/...",
  "opening_hours": "Mon-Sun 8am-5pm",
  "type": "public",
  "labels": ["Cemetery"],
  "notes": "Historic cemetery established 1839",
  "data_source": "Google+OSM",
  "osm_id": "12345678",
  "osm_type": "way"
}
```

---

## 🧠 Data Strategy

```
OSM (base)  →  Name, coordinates, basic tags
    ↓
Nominatim   →  City, county, ZIP code (reverse geocoding)
    ↓
Google      →  Phone, website, opening hours (if API key provided)
    ↓
MongoDB     →  Upsert with duplicate prevention (name + lat + lon)
```

Validation rules:
- Google result must be within 0.5km of OSM coordinates
- Name similarity must be ≥ 50% (using SequenceMatcher)
- OR shared significant words in name

---

## ⚙️ Configuration Notes

- **Rate limiting**: Nominatim requires ≥ 1 second between requests (enforced)
- **Batching**: Pipeline processes states one at a time
- **Deduplication**: Unique MongoDB index on `(name, latitude, longitude)`
- **Admin password**: Set `ADMIN_PASSWORD` in `.env` (default: `admin123`)
- **Google API quota**: Uses ~2 API calls per cemetery (search + details)

---

## 🚢 Production Deployment

For production, consider:
- Use `gunicorn` instead of Flask dev server: `gunicorn -w 4 app:create_app()`
- Set `DEBUG=False`
- Use proper session secret key
- Add rate limiting to the API (Flask-Limiter)
- Enable MongoDB Atlas IP allowlist
- Set up HTTPS (via Nginx + Let's Encrypt)

---

## 📝 License

For research, genealogy, and educational purposes.
Data sourced from OpenStreetMap (ODbL), Nominatim, and Google Places API.


// Future me avoid kaise kare:
Kabhi bhi detached HEAD me kaam mat kar
Always:
git checkout main
git pull
# then changes
git add .
git commit -m "msg"
git push

Agar tu chahe toh main tujhe visual diagram (flowchart) + real-world Git workflow bana ke de deta hoon — ek baar samajh gaya toh kabhi phasoge nahi.