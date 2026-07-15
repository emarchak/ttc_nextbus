# 🚋 TTC Next Vehicle — a TRMNL e-ink plugin

Real-time TTC bus and streetcar arrivals for any stop in Toronto, on a
[TRMNL](https://usetrmnl.com) e-ink display. Search for your stop by **address
or intersection**, pick a **direction of travel**, and see the next vehicles at
a glance — no more sprinting for a streetcar you can't catch.

> Built as a TRMNL [Recipe](https://help.trmnl.com/en/articles/10122094-plugin-recipes):
> TRMNL's servers poll the TTC feed directly, so no rider data ever passes
> through third-party infrastructure. The only hosted component is a tiny
> stateless search endpoint used during plugin setup.

## How it works

```
┌─────────────────┐     setup only      ┌──────────────────────────┐
│  TRMNL plugin    │  "queen & spadina"  │  /api/stops (Vercel)      │
│  config form     │ ──────────────────▶ │  Nominatim geocode        │
│  (xhrSelectSearch)│ ◀────────────────── │  + nearest-stop search    │
└─────────────────┘   nearby stops      │  over bundled GTFS data   │
        │                                └──────────────────────────┘
        │ every refresh (~15 min)
        ▼
┌─────────────────┐                     ┌──────────────────────────┐
│  TRMNL servers   │ ──────────────────▶ │  TTC NextBus feed (UMO)   │
│  poll + render   │ ◀────────────────── │  retro.umoiq.com          │
└─────────────────┘   JSON predictions  └──────────────────────────┘
        │
        ▼
   e-ink screen 🖥️
```

1. **Stop search** — during setup, the plugin's search box hits `/api/stops`,
   which geocodes the query via [Nominatim](https://nominatim.org/) (bounded to
   the GTA) and returns the nearest TTC stops by haversine distance, computed
   over a compact dataset built from the
   [TTC's GTFS feed](https://open.toronto.ca/dataset/ttc-routes-and-schedules/).
   Typing a numeric stop ID (printed on every stop pole) matches directly.
2. **Predictions** — TRMNL polls the TTC's public
   [NextBus/UMO feed](https://retro.umoiq.com/xmlFeedDocs/NextBusXMLFeed.pdf)
   for the configured stop. No API key required.
3. **Rendering** — Liquid + vanilla JS templates normalize the feed's
   polymorphic JSON and render arrivals using
   [TRMNL's design framework](https://trmnl.com/framework), with layouts for
   full screen, half (horizontal & vertical), and quadrant mashups.

## Repository layout

```
├── api/
│   └── stops.js                 # Vercel function: geocode + nearest-stop search
├── data/
│   └── stops.json               # ~9,300 TTC stops [code, name, lat, lon]
├── scripts/
│   ├── build-stops.mjs          # Rebuilds stops.json from the latest TTC GTFS
│   └── test-api.mjs             # Local smoke test for the API handler
└── trmnl/
    ├── form-fields.yaml         # TRMNL plugin configuration form
    └── markup/                  # Liquid templates for each screen layout
        ├── full.liquid
        ├── half_horizontal.liquid
        ├── half_vertical.liquid
        └── quadrant.liquid
```

## The interesting bits

**The NextBus feed is XML converted to JSON**, which means every node is
polymorphic: `predictions` is an object for single-route stops and an array for
multi-route stops; `direction` is an object, an array, or absent entirely when
a route has no service; `prediction` is an object for one vehicle and an array
for several. A single `asArray()` normalizer in each template handles all
shapes — verified against live streetcar stops, bus stops, night-route stops,
and out-of-service periods.

**The stop dataset ships with the function.** The TTC's GTFS `stops.txt`
(~9,300 stops) compresses to a ~580 KB tuple array bundled into the Vercel
function, so stop search needs no database and stays within free-tier limits.
The only runtime network call is one Nominatim geocode per keystroke-debounced
search.

**Direction filtering uses prediction metadata, not stop metadata.** GTFS
doesn't reliably encode direction per stop, but NextBus direction titles always
lead with the heading ("East - 501 Queen towards Neville Park"), so filtering
is a prefix match on the live data.

## Running it yourself

### 1. Deploy the search endpoint

Fork/clone this repo and import it into [Vercel](https://vercel.com) — the
`api/` directory deploys automatically. No environment variables needed.

```bash
# refresh the stop dataset when the TTC publishes a GTFS update
npm run build:stops

# smoke-test the search endpoint locally
node scripts/test-api.mjs "Queen St W and Spadina Ave"
node scripts/test-api.mjs 6916
```

### 2. Create the TRMNL plugin

1. In TRMNL: **Plugins → Private Plugin → New**
2. Strategy: **Polling**, URL:
   ```
   https://retro.umoiq.com/service/publicJSONFeed?command=predictions&a=ttc&stopId={{ stop_id }}
   ```
3. Paste [`trmnl/form-fields.yaml`](trmnl/form-fields.yaml) into **Form Fields**,
   replacing the `endpoint` URL with your Vercel deployment
4. Paste each template from [`trmnl/markup/`](trmnl/markup/) into the matching
   tab of the Markup editor
5. Save, configure your stop, and hit **Force Refresh**

### 3. Share it (optional)

Click **Publish as Recipe** on the plugin settings page to submit it to the
[TRMNL recipe marketplace](https://trmnl.com/recipes).

## Data sources & credits

- Arrival predictions: [TTC NextBus/UMO public feed](https://retro.umoiq.com/xmlFeedDocs/NextBusXMLFeed.pdf) — data © Toronto Transit Commission
- Stop locations: [TTC Routes and Schedules (GTFS)](https://open.toronto.ca/dataset/ttc-routes-and-schedules/), City of Toronto Open Data, [Open Government Licence – Toronto](https://open.toronto.ca/open-data-license/)
- Geocoding: [Nominatim](https://nominatim.org/) / © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Display framework: [TRMNL](https://usetrmnl.com)

## License

[MIT](LICENSE) — TTC and OpenStreetMap data remain subject to their respective licences.
