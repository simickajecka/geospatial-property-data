# Real-Estate Map Playbook

How to turn a wide CSV of properties into a map people can actually reason with — the reference
sites worth copying, the encodings that work, the pipeline, and the traps.

Written against a concrete scenario: one CSV, one row per property, columns roughly like

```
id, lat, lon, address, municipality, cadastral_municipality, parcel_no,
price, area_m2, rooms, floor, year_built, type, listed_at, sold_at, status, agency, photos_url
```

Everything below assumes that shape. Substitute your own columns.

---

## 0. Pick the pattern first

The single biggest mistake is choosing a visual before choosing the question. Match them:

| The user's question | The right view | Not this |
|---|---|---|
| "What is for sale near me?" | Points + clustering + price pills, list synced to viewport | Heatmap |
| "Is this asking price fair?" | One highlighted point + comparables + local €/m² distribution | Whole-country choropleth |
| "Where is it expensive?" | Choropleth or hexbin of **median €/m²** | Choropleth of raw price, or of count |
| "Where is activity concentrated?" | Density: hexbin, or KDE heatmap | Choropleth |
| "How has the market moved?" | Small multiples by year, or map + time slider + linked line chart | Animated-only map |
| "What is inside this exact parcel?" | Cadastral polygons + attribute panel | Points |
| "How far is it from work/school?" | Isochrone overlay, travel-time filter | Straight-line radius |
| "How do two variables interact?" (price vs. income) | Bivariate choropleth, or map + linked scatterplot with brushing | Two maps side by side |

Write the question down first. If a chart does not answer it, cut the chart.

---

## 1. The reference sites — where to look and what to steal

A working link list. Open these side by side; the patterns are easier to absorb than to describe.
Two things to do on every one of them: **zoom out to the whole country** and see what the map
degrades into, and **resize to a phone width** and see what they drop.

### 1.1 France — the most interesting market to study

France is unusually good territory here, because every notarized transaction is open data (DVF),
so you can compare what the portals *show* against what actually *sold*.

| Site | URL | What to steal |
|---|---|---|
| **Bien'ici** | https://www.bienici.com/carte | The most ambitious consumer property map in Europe. A real 3D city model, draw-your-own search zone, travel-time search (walk/bike/transit/car), and **Lumen** — a sun-exposure simulator that casts real shadows from the 3D buildings across the day and the seasons. That is an environmental variable rendered spatially, which almost nobody does. |
| **DVF — official Etalab viewer** | https://app.dvf.etalab.gouv.fr/ | Click any parcel in France, get every transaction on it from the last five years. Parcel polygons + transaction records + an honest legend. The reference implementation of "open cadastral data on a web map". |
| **data.gouv.fr property explorer** | https://explore.data.gouv.fr/fr/immobilier | The newer government front-end over the same DVF data. |
| **DVF Explorer** (third party) | https://dvfexplorer.fr/ | Same data, commercial polish: median €/m², sales volume trend, per-commune and per-address pages. Good study in how much value a better UI adds over identical open data. |
| **MeilleursAgents price map** | https://www.meilleursagents.com/prix-immobilier/ | €/m² from region → department → city → neighborhood → *street*, with a published **confidence index (1–5)** shown next to the estimate. Copy this: it is the uncertainty channel almost every price map omits. |
| **MeilleursAgents / DVF** | https://www.meilleursagents.com/prix-immobilier/dvf/ | Millions of sold properties mapped, each with "sold for X then, worth Y now". |
| **SeLoger** | https://www.seloger.com/ | The mainstream portal baseline — map search, drawn zones, quartier price pages. |
| **PAP** | https://www.pap.fr/ | Owner-to-owner listings; leaner map, fewer tricks, fast. |
| **Géoportail de l'Urbanisme** | https://www.geoportail-urbanisme.gouv.fr/ | Zoning (PLU) polygons — what you are legally allowed to build. Layer-stack UI over cadastre. |
| **cartes.gouv.fr** | https://cartes.gouv.fr/ | IGN's new unified geoportal, consolidating Géoportail and Géoservices: cadastre, orthophoto, relief, historic maps. |
| **Géoportail** | https://www.geoportail.gouv.fr/ | Still live; the classic layer-swipe interface. |
| **Cadastre** | https://www.cadastre.gouv.fr/ | Official parcel lookup. |
| **Remonter le temps** (IGN) | https://remonterletemps.ign.fr/ | Not real estate, but the **best split-screen time-comparison UI on the web** — two basemaps from different eras, a transparency slider and a synced swipe. Cassini (18th c.), État-Major (1825–66), 1950s aerials, today. Steal this control outright for before/after work. |
| **Immobilier.notaires.fr** | https://immobilier.notaires.fr/ | The notaries' own price data and listings. |

### 1.2 USA & Canada

| Site | URL | What to steal |
|---|---|---|
| **Zillow** | https://www.zillow.com/ | Price pills as markers — the number *is* the pin. Draw-a-region search. The Zestimate everywhere, on every parcel, whether or not it is for sale. |
| **Redfin** | https://www.redfin.com/ | The tightest map↔list binding in the business: pan the map and the list refilters, hover a card and the pin lifts. Also surfaces zoning on the property page. |
| **Redfin Data Center** | https://www.redfin.com/news/data-center/ | The analytics product split cleanly away from the search product: metro choropleths, time series, and everything downloadable. |
| **Realtor.com** | https://www.realtor.com/ | Layer toggles for schools, noise, flood risk — context layers as a first-class feature. |
| **Trulia** | https://www.trulia.com/ | The original neighborhood-overlay maps (crime, schools, commute) — worth seeing for how far overlays can be pushed before they mislead. |
| **NYC ZoLa** | https://zola.planninglabs.nyc/ | Click a lot → the full attribute sheet. Open source: https://github.com/NYCPlanning/labs-zola |
| **NYC PLUTO / MapPLUTO** | https://www.nyc.gov/site/planning/data-maps/open-data/dwn-pluto-mappluto.page | 70+ fields per tax lot, free. The dataset behind ZoLa, and a model for what a parcel attribute schema looks like. |
| **Regrid** | https://regrid.com/ | ~156M standardized US + Canada parcel records with boundaries. The commercial answer to "where do I get parcel polygons". |
| **Inside Airbnb** | https://insideairbnb.com/ | Per-listing points across 80+ cities with an explicit methodology page. Credibility through showing the derivation. |
| **HouseSigma** (CA) | https://housesigma.com/ | Sold prices and estimates on the map, aggressive data density. |
| **Realtor.ca** (CA) | https://www.realtor.ca/ | The national Canadian portal; clustering at national zoom. |

### 1.3 UK & Ireland

| Site | URL | What to steal |
|---|---|---|
| **Rightmove** | https://www.rightmove.co.uk/ | Sold-price history layered under for-sale listings; commute-time search as a primary filter. |
| **Zoopla** | https://www.zoopla.co.uk/ | Per-property value estimates and area price heat overlays. |
| **OnTheMarket** | https://www.onthemarket.com/ | Simpler map, good draw-a-shape implementation. |
| **Housemetric** | https://housemetric.co.uk/map/ | A pure **£/sqm heat map** from Land Registry sold prices joined to EPC floor areas. Small, focused, exactly the "normalize by area" lesson in practice. |
| **HM Land Registry Price Paid** | https://landregistry.data.gov.uk/ | The open transaction dataset itself, as linked data. |
| **ONS house prices, small areas** | https://www.ons.gov.uk/datasets/house-prices-local-authority | Statistics down to LSOA (400–1,200 households) — the right granularity question, worked out by a national statistics office. |
| **Daft.ie** (IE) | https://www.daft.ie/ | Ireland's portal, with a good published market report series. |

### 1.4 Rest of Europe

| Site | URL | What to steal |
|---|---|---|
| **Idealista** (ES/IT/PT) | https://www.idealista.com/ | Draw on map, €/m² by barrio, street view integration. Price is *always* normalized by area. |
| **Funda** (NL) | https://www.funda.nl/ | Draw-on-map plus the energy label as a colored chip — a categorical attribute rendered legibly at pin scale. |
| **PDOK** (NL) | https://www.pdok.nl/ | Dutch national geodata, including cadastral vector tiles. A benchmark for how fast national tiled data can feel. |
| **Hemnet** (SE) | https://www.hemnet.se/ | Restraint: near-monochrome basemap, one accent, photography carries the page. |
| **ImmobilienScout24** (DE) | https://www.immobilienscout24.de/ | Neighborhood-quality scoring as a soft polygon layer *under* the listings — derived data as context, not as the main mark. |
| **Homegate** (CH) | https://www.homegate.ch/ | "Doodle" a custom search area on the map. |
| **map.geo.admin.ch** (CH) | https://map.geo.admin.ch/ | ~150 federal datasets in one viewer. The gold standard for a layer catalogue that does not overwhelm. |
| **Boliga** (DK) | https://www.boliga.dk/ | Danish listings with lat/lon, DKK price, m², energy class and days-on-market — a clean model of the field set you actually need. |
| **FINN eiendom** (NO) | https://www.finn.no/realestate | Map search inside a general classifieds site. |
| **Immoweb** (BE) | https://www.immoweb.be/ | |
| **Otodom** (PL) | https://www.otodom.pl/ | |
| **Sreality** (CZ) | https://www.sreality.cz/ | |
| **willhaben** (AT) | https://www.willhaben.at/ | |

### 1.5 Balkans & Serbia

| Site | URL | What to steal |
|---|---|---|
| **GeoSrbija** | https://a3.geosrbija.rs/ | The national geoportal: parcels, addresses, orthophoto, spatial plans. Parcel polygons as the primary geometry, layer switcher over imagery, and OGC services you can consume directly from OpenLayers or QGIS. |
| **RGZ eKatastar (public access)** | https://katastar.rgz.gov.rs/eKatastarPublic/publicaccess.aspx | Search by *katastarska opština + broj parcele*, or by address. The query model your users already know. |
| **RGZ Registar cena nepokretnosti** | https://www.rgz.gov.rs/registar-cena-nepokretnosti | The official transaction-price register — the authoritative source for market analysis, and the closest Serbian equivalent to France's DVF. |
| **4zida** | https://www.4zida.rs/ | The best local map UX; prices in €, area in m², search by opština then naselje. |
| **Nekretnine.rs** | https://www.nekretnine.rs/ | |
| **Halo oglasi** | https://www.halooglasi.com/nekretnine | |
| **Njuškalo** (HR) | https://www.njuskalo.hr/ | |
| **Nepremičnine** (SI) | https://www.nepremicnine.net/ | |

### 1.6 Rest of the world

| Site | URL | What to steal |
|---|---|---|
| **homes.co.nz** | https://homes.co.nz/map | ~1.7M properties — *every* home in New Zealand — on one map with an estimate and sales history, no login. The clearest demonstration that "map of all properties" beats "map of listings". |
| **OneRoof** (NZ) | https://www.oneroof.co.nz/estimate/map/region_all-new-zealand-1 | Same idea, different execution; compare the two. |
| **Domain** (AU) | https://www.domain.com.au/ | Home Price Guide estimates on the map. |
| **realestate.com.au** | https://www.realestate.com.au/ | The dominant AU portal; strong suburb-level profile pages. |
| **LIFULL HOME'S PRICE MAP** (JP) | https://lifullhomes-satei.jp/price-map/view/ | Japanese price-per-*tsubo* map with a reference price computed for buildings that are not even for sale. Note the unit convention — always use the local one. |
| **SUUMO land prices** (JP) | https://suumo.jp/tochi/soba/ | Land price by prefecture, ward and *train station* — a locally meaningful spatial unit that is not administrative. |
| **QuintoAndar** (BR) | https://www.quintoandar.com.br/ | |
| **Housing.com** (IN) | https://housing.com/ | |
| **PropertyGuru** (SG) | https://www.propertyguru.com.sg/ | |

### 1.7 Analytics, valuation and open-data references

| Site | URL | What to steal |
|---|---|---|
| **Zillow Research** | https://www.zillow.com/research/data/ | Free indices and downloadable market data — a model for publishing your own derived metrics. |
| **PriceHubble** | https://www.pricehubble.com/ | Valuation surfaces with an explicit confidence channel. |
| **HouseCanary** | https://www.housecanary.com/ | Block-level AVM and forecast surfaces. |
| **CoStar** | https://www.costar.com/ | Commercial real estate; the deepest attribute model in the industry. |

### 1.8 Tools and showcases to sketch with

| Tool | URL | Use |
|---|---|---|
| **kepler.gl** | https://kepler.gl/demo | Drag your CSV in, get points/hex/heat/arcs in seconds. **Do this before you build anything** — it will tell you within five minutes whether your data has a spatial story. |
| **deck.gl examples** | https://deck.gl/examples | Reference implementations: hexbin, H3, arcs, trips, 3D extrusion at millions of rows. |
| **deck.gl showcase** | https://deck.gl/showcase | Real projects built on it. |
| **MapLibre** | https://maplibre.org/ | The library to default to. |
| **Felt** | https://felt.com/ | "Figma for maps" — collaborative, commentable, shareable. |
| **Datawrapper maps** | https://www.datawrapper.de/maps | The standard for legends, annotation and responsive choropleths. |
| **Observable** | https://observablehq.com/ | Notebook prototyping for linked map + chart views. |
| **Protomaps / PMTiles** | https://protomaps.com/ | Single-file tiles on static hosting — no tile server. |
| **Tippecanoe** | https://github.com/felt/tippecanoe | GeoJSON → vector tiles. |
| **DuckDB spatial** | https://duckdb.org/docs/stable/extensions/spatial | CSV → cleaned, reprojected, aggregated, in one binary. |

---

## 2. The visual vocabulary

Each entry: what it is → when it works → how it fails.

### 2.1 Points (pins / dots)

Every row is one mark. Truthful, no aggregation lies.

- **Works** when under roughly 2,000 marks are visible and the user cares about individual properties.
- **Fails** when dense urban cores turn into a solid blob, and when identical coordinates (40 flats in one building) stack invisibly.
- **Fixes**: cluster (below); jitter duplicates by a few meters *for display only*; use a small radius at low opacity so overlap reads as density; draw the highlighted mark last.

### 2.2 Clustering

Group nearby points into a bubble with a count; expand on zoom.

- **Works** as the default for any listings map above a few thousand rows.
- **Fails** when clusters jump around while panning, or when "300 listings" tells the user nothing useful.
- **Upgrade**: make the cluster carry an aggregate — size by count, **color by median €/m²**. Now the zoomed-out view is informative instead of merely tidy.

### 2.3 Price pills / labeled markers

The Zillow move: the marker is a rounded label reading `€185k` or `€1 950/m²`.

- **Works** at listing scale (10–200 visible), where the number is the thing being compared.
- **Fails** through collision. You need label decluttering (`text-allow-overlap: false` in MapLibre, or a collision index) and an explicit priority order — price? recency? promoted listings?

### 2.4 Graduated symbols (bubbles)

Radius encodes a quantity.

- **Rule**: scale by **area, not radius** — `r = k * sqrt(value)`. Linear radius exaggerates large values quadratically.
- **Works** for absolute counts (transactions per municipality).
- **Fails** for rates and ratios — use color for those.

### 2.5 Heatmap (kernel density)

A smooth blur of point density.

- **Works** for exactly one job: *where are the points concentrated*. Good for "where is the market active".
- **Fails** badly when readers interpret it as a price surface. It is a **count** map — a heatmap of listings mostly redraws where buildings are. The radius and intensity parameters are arbitrary: change them, change the story.
- **Rule of thumb**: heatmap counts, or do not use a heatmap. Never heatmap a value.

### 2.6 Hexbin / H3

Aggregate into equal-area cells. H3 (Uber's hierarchical hex index) is the practical standard.

- **Works** brilliantly for a value surface: median €/m² per hex, at a resolution matched to zoom (H3 res 7–9 at city scale).
- **Better than choropleth** because cells are equal-area — no visual weight handed to big rural districts — and resolution is a knob you control rather than an accident of administrative history.
- **Fails** when cells are sparse: a hex with 2 sales shows noise. Suppress cells below a minimum n (say 5) and say so in the legend.

### 2.7 Choropleth (administrative polygons)

Color municipalities, cadastral municipalities or census units by a value.

- **Non-negotiable**: color a **normalized** value — median price per m², sales per 1,000 dwellings. Never raw totals, or you have drawn a population map.
- **Fails** via MAUP (modifiable areal unit problem): the same data on different boundaries tells different stories. Large sparse polygons also dominate visually while holding few people.
- **Fixes**: pair with a cartogram or a value-by-alpha treatment (fade low-confidence units); show n on hover; state the boundary vintage.

### 2.8 Dot density

One dot per N units (per 10 sales, per 100 dwellings), placed randomly inside the polygon.

- **Works** for showing distribution and mixture without choropleth's area bias.
- **Fails** if readers think a dot is a real address. Say "dots are placed randomly within each area" in the legend.

### 2.9 3D extrusion / spike map

Height encodes value, usually on hexes or parcels.

- **Works** for a genuine wow moment, and for a sharply peaked surface (a downtown price spike) that flat color compresses.
- **Fails** because tall marks occlude short ones, perspective distorts comparison, and reading exact values is impossible. Never the only view — pair it with a flat 2D version.

### 2.10 Bivariate choropleth

A 3×3 color grid encoding two variables at once (price × income, price × rental yield).

- **Works** for a specific, well-explained analytical claim.
- **Fails** as a default — the legend has to teach the reader. Budget real space for a proper 2D key.

### 2.11 Parcel polygons (cadastral)

The real geometry: property boundaries, buildings, land use.

- **Works** whenever the question is legal or physical — what exactly is being sold, what shape is the plot, does it touch a road.
- **Costs** much more than points. Needs vector tiles above a few thousand features. Load only at zoom ≥ 15–16 and show points below that.

### 2.12 Isochrones / accessibility

Polygons of "reachable in 15 minutes by car / transit / on foot".

- **Works** as a *filter*, not just a layer: "flats under €150k within 20 minutes of this pin". This is the feature users remember.
- **Sources**: Valhalla, OpenRouteService, GraphHopper (self-hostable), or Mapbox's isochrone endpoint.

### 2.13 Time

- **Time slider** — fine for exploration, poor for comparison; human memory is a bad differencing engine.
- **Small multiples** — 6–12 tiny maps, one per year, identical scale and legend. Best tool for change. Badly underused.
- **Change map** — map the *delta* (% change 2020→2025) with a diverging palette centered on zero. Usually the most informative single frame you can produce.
- **Animation** — only with a scrubber the user controls, and always alongside a static summary.

### 2.14 The linked dashboard (the pattern that actually wins)

Map + histogram + scatter + table, all filtering each other:

- Brush the price histogram → the map dims out-of-range points.
- Draw a shape on the map → histogram and table recompute.
- Hover a table row → the matching point pulses.
- Every active filter is a removable chip, and there is always a reset.

Cross-filtering is where insight lives — not in any single chart. This is the workhorse layout for
a data-rich real-estate product.

### 2.15 The non-map views you still need

- **€/m² distribution** for the current selection with the subject property marked — answers "is this fair?" faster than any map.
- **Comparables table** sorted by distance, showing the delta to the subject property.
- **Time on market** as a survival-style curve.
- **Photos and street view** — for consumers, imagery beats every chart on the page.

---

## 3. The pipeline

### Step 1 — Profile before you plan

```bash
duckdb -c "DESCRIBE SELECT * FROM read_csv_auto('listings.csv');"
```

```bash
duckdb -c "SELECT count(*) AS rows, count(lat) AS has_lat, count(DISTINCT id) AS uniq_ids, min(lat), max(lat), min(lon), max(lon) FROM read_csv_auto('listings.csv');"
```

Know the row count first — it decides the entire architecture (Step 8).

### Step 2 — Clean and type

- **Prices**: strip currency symbols, thousands separators and "on request". Store a plain number; keep the original in `price_raw`.
- **Area**: watch for `m2`, `m²`, `kv m`, and ares/hectares on land parcels.
- **Dates**: ISO 8601, one timezone, stored as DATE.
- **Categoricals**: normalize case and diacritics *for matching*, keep the original *for display* — `Čačak` and `Cacak` must resolve to one place, but the real name is what gets shown.
- **Deduplicate**: the same flat listed by three agencies is three rows. Fuzzy-key on (rounded coords, area, rooms, price band).

### Step 3 — Get real coordinates

In order of preference:

1. **Coordinates already in the data** — validate, do not trust.
2. **Cadastral join** — with KO + parcel number, join to the official parcel layer and use its polygon or centroid. Most precise path, and the one this project is already set up for.
3. **Address geocoding** — Nominatim (self-host for any volume; the public endpoint enforces 1 req/s), Pelias, Photon, or a commercial geocoder. Always store the returned confidence / match type and the matched string.
4. **Centroid fallback** — settlement or municipality centroid. **Flag these rows.** A fallback point must never render identically to a precise one; a hundred listings stacked on the town hall is the classic embarrassment.

### Step 4 — Fix the coordinate reference system

The number one source of both "my points are in the Gulf of Guinea" and "my points are 300 m off".

- Web display is **EPSG:4326** (lat/lon); tiles are **EPSG:3857** (Web Mercator).
- National and cadastral data is almost never either. Reproject **once, in the pipeline** — never in the browser.
- See the Serbia / RGZ appendix (§9) for the specific codes and gotchas.

```sql
INSTALL spatial; LOAD spatial;
COPY (
  SELECT *,
         ST_X(ST_Transform(ST_Point(easting, northing), 'EPSG:8682', 'EPSG:4326')) AS lon,
         ST_Y(ST_Transform(ST_Point(easting, northing), 'EPSG:8682', 'EPSG:4326')) AS lat
  FROM read_csv_auto('listings.csv')
) TO 'listings_wgs84.parquet' (FORMAT PARQUET);
```

### Step 5 — Validate geometry

Cheap assertions that catch most disasters:

```sql
SELECT
  count(*) FILTER (WHERE lat IS NULL OR lon IS NULL)       AS missing,
  count(*) FILTER (WHERE lat = 0 AND lon = 0)              AS null_island,
  count(*) FILTER (WHERE lat NOT BETWEEN 41.8 AND 46.2)    AS lat_outside_country,
  count(*) FILTER (WHERE lon NOT BETWEEN 18.8 AND 23.1)    AS lon_outside_country
FROM listings;
```

Then group by exact coordinate pair and eyeball the top 20 — those are your fallback centroids and
your data-entry defaults, and they need different styling or exclusion.

### Step 6 — Derive the metrics that matter

Raw price is nearly useless on a map. Compute:

- `price_per_m2 = price / area_m2` — the primary comparable metric.
- `price_index = price_per_m2 / median(price_per_m2) OVER (neighborhood)` — "how expensive for around here".
- `z_score` within neighborhood **and** property type — finds outliers and mispricing.
- `days_on_market`, `price_cuts`, `price_change_pct`.
- `n` for every aggregate — needed for suppression and for hover text.

### Step 7 — Spatial join to your aggregation units

```sql
-- point in polygon, to administrative units
CREATE TABLE joined AS
SELECT l.*, a.opstina_id, a.opstina_name
FROM listings l
LEFT JOIN admin a ON ST_Within(ST_Point(l.lon, l.lat), a.geom);
```

```sql
-- or to H3 cells (requires the h3 community extension)
INSTALL h3 FROM community; LOAD h3;
SELECT h3_latlng_to_cell(lat, lon, 8) AS h3,
       median(price_per_m2) AS med_ppm2,
       count(*) AS n
FROM listings
GROUP BY 1
HAVING count(*) >= 5;
```

Precompute aggregates at two or three H3 resolutions (say 6 / 8 / 10) and swap them by zoom level.

### Step 8 — Choose the serving strategy by size

| Rows | Approach |
|---|---|
| < 1,000 | Ship GeoJSON in the bundle. Leaflet or MapLibre, done. |
| 1k – 50k | GeoJSON fetched once, plus clustering (MapLibre `cluster: true` or Supercluster). Client-side filtering is instant. |
| 50k – 1M | Vector tiles — PMTiles on static hosting, no tile server needed — or deck.gl over a compact binary / Parquet payload. |
| 1M – 100M | Server-side tiles from PostGIS (`ST_AsMVT` via Martin, pg_tileserv or Tegola), or pre-aggregate to H3 and ship only cells. |
| > 100M | Pre-aggregate, always. Nobody needs 100M individual dots; they need the surface. |

Generating static tiles:

```bash
tippecanoe -zg -o listings.pmtiles --drop-densest-as-needed --extend-zooms-if-still-dropping -l listings listings.geojson
```

One `.pmtiles` file, served from any static host or CDN with HTTP range requests. No tile server to
operate — this is the single biggest architectural simplification available today.

### Step 9 — Style

Color rules are in §6. Two structural points:

- **The basemap must recede.** Use a muted or monochrome style (Positron, Dark Matter, or a custom low-contrast style). A colorful basemap fights your data every time.
- **Keep place labels above your data and roads below it.** In MapLibre, insert layers with `beforeId` pointing at the first symbol layer.

### Step 10 — Interaction

Non-negotiable:

- Hover → tooltip with the three facts that matter. Click → panel with everything.
- Legend always visible, stating the classification method and the n.
- Zoom-dependent detail: hexes far out, clusters mid-range, individual parcels close in.
- **Deep-linkable state** — encode viewport and filters in the URL (`?bbox=…&price=50000-120000`). Users share links; make the links work.
- A visible reset, and keyboard access to every control.

### Step 11 — Performance budget

- Under 2 s to a meaningful map on a mid-range phone over 4G.
- Initial payload under roughly 1 MB; load detail on demand.
- 60 fps while panning: no per-frame GeoJSON re-parse, no React re-render per mousemove (throttle hover to `requestAnimationFrame`).
- Simplify polygons per zoom (`ST_SimplifyPreserveTopology`, or let tippecanoe handle it).
- Round coordinates to 6 decimals (~11 cm). More than that is wasted bytes.

---

## 4. Tool matrix

### Map rendering (JavaScript)

| Tool | Use it when | Notes |
|---|---|---|
| **Leaflet** | Simple point maps, quick wins, raster tiles | Tiny, ancient, bulletproof. Struggles past ~10k markers. |
| **MapLibre GL JS** | The default choice for anything modern | Open-source fork of Mapbox GL v1, no token, vector tiles, GPU rendering, styling via a JSON spec. Start here. |
| **Mapbox GL JS** | You want their basemaps, geocoder and isochrone APIs | Commercial licensing and a token; excellent product. |
| **deck.gl** | Large data, hexbin/H3, 3D, GPU-heavy layers | Composes on top of MapLibre. `ScatterplotLayer`, `H3HexagonLayer`, `HexagonLayer`, `GeoJsonLayer`. |
| **OpenLayers** | Serious GIS: WMS/WFS, arbitrary projections, precise cartography | Steeper API but it speaks OGC natively — relevant for RGZ/GeoSrbija services. |
| **ArcGIS Maps SDK** | You are already in the Esri ecosystem | Strong analysis widgets, licensed. |
| **CesiumJS** | Genuine 3D terrain and globe work | Overkill for most real-estate use cases. |

### Supporting JS

- **Turf.js** — geometry ops in the browser (buffer, within, distance, centroid).
- **Supercluster** — the clustering engine, usable standalone in a worker.
- **h3-js** — H3 indexing client-side.
- **PMTiles** — single-file tile archive; a protocol handler plugs straight into MapLibre.
- **Observable Plot / D3** — the linked charts beside the map.
- **MapLibre Draw / Terra Draw** — polygon-draw search.

### No-code / fast exploration

| Tool | Best for |
|---|---|
| **kepler.gl** | Drag a CSV in, get points/hex/heat/arcs instantly. The fastest way to *see* your data. |
| **Felt** | Collaborative, shareable, comment-able maps. |
| **Datawrapper** | Publication-quality choropleths and symbol maps with good legends and mobile behavior. |
| **Flourish** | Animated and scrollytelling maps. |
| **QGIS** (+ qgis2web) | Full desktop GIS; the workhorse for prep, joins, projections, and quick exports. Free. |
| **Tableau / Power BI** | Internal BI dashboards where the map is one tile among many. |
| **CARTO** | Enterprise spatial analytics on a warehouse. |

### Data prep

- **DuckDB + spatial extension** — reads CSV/Parquet/GeoJSON/Shapefile, does `ST_*`, transforms CRS, writes anything. Single binary, no server. **Start here for a CSV.**
- **PostGIS** — when you need a real spatial database, indexes and live queries.
- **GDAL / ogr2ogr** — the universal converter/reprojector.
- **GeoPandas / Shapely / pyproj** — Python path.
- **tippecanoe** — GeoJSON → vector tiles / PMTiles.
- **Martin, pg_tileserv, Tegola** — dynamic MVT from PostGIS.

### Geocoding & routing

- **Nominatim** (OSM) — free, self-hostable; the public instance is rate-limited to 1 req/s.
- **Photon / Pelias** — self-hostable, better for autocomplete.
- **OpenRouteService, Valhalla, GraphHopper, OSRM** — routing and isochrones.
- Commercial: Google, Mapbox, HERE — better address coverage, per-request pricing, and check the licence on storing results.

---

## 5. Three build recipes

### Recipe A — "I have 3,000 listings and one afternoon"

MapLibre + clustered GeoJSON. No build step needed beyond your bundler.

```js
map.addSource('listings', {
  type: 'geojson',
  data: '/data/listings.geojson',
  cluster: true,
  clusterRadius: 50,
  clusterMaxZoom: 14,
  clusterProperties: {
    // aggregate carried up into the cluster bubble
    sum_ppm2: ['+', ['get', 'price_per_m2']],
    n:        ['+', 1]
  }
});

map.addLayer({
  id: 'clusters',
  type: 'circle',
  source: 'listings',
  filter: ['has', 'point_count'],
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 5, 14, 500, 34],
    'circle-color': [
      'interpolate', ['linear'],
      ['/', ['get', 'sum_ppm2'], ['get', 'n']],   // mean €/m² in the cluster
      1000, '#f0e6d8', 1800, '#d9a441', 2600, '#a8452f'
    ],
    'circle-opacity': 0.9
  }
});

map.addLayer({
  id: 'unclustered',
  type: 'circle',
  source: 'listings',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-radius': 5,
    'circle-color': '#a8452f',
    'circle-stroke-width': 1,
    'circle-stroke-color': '#fff'
  }
});
```

Add: click a cluster → `getClusterExpansionZoom` → `easeTo`. Click a point → side panel. Bind the
list to `map.on('moveend', …)` + `queryRenderedFeatures`.

### Recipe B — "I have 400,000 rows and want a price surface"

Pre-aggregate to H3 in DuckDB (Step 7), ship the cells as JSON, render with deck.gl:

```js
import { H3HexagonLayer } from '@deck.gl/geo-layers';

new H3HexagonLayer({
  id: 'ppm2',
  data: '/data/h3_res8.json',          // [{ h3, med_ppm2, n }, …]
  getHexagon: d => d.h3,
  extruded: false,                      // flat first; 3D only as a secondary view
  getFillColor: d => colorScale(d.med_ppm2),
  getLineColor: [0, 0, 0, 20],
  opacity: 0.75,
  pickable: true,
  updateTriggers: { getFillColor: [metric, breaks] }
});
```

Swap the data URL by zoom for res 6 / 8 / 10. Suppress `n < 5` server-side, and say so in the legend.

### Recipe C — "Cadastral parcels, national scale"

1. Export parcels from the source (Shapefile / GML / GeoPackage), reproject to EPSG:4326 with `ogr2ogr`.
2. `tippecanoe` → `parcels.pmtiles`, minzoom 14 so you never serve the whole country as polygons.
3. Serve the `.pmtiles` from static storage; register the PMTiles protocol in MapLibre.
4. Points layer below zoom 14, polygons above; the transition should be invisible.
5. Attributes stay in Postgres, fetched on click by parcel id — do not bake a fat attribute table into the tiles.

```js
import { Protocol } from 'pmtiles';
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

map.addSource('parcels', { type: 'vector', url: 'pmtiles://https://cdn.example/parcels.pmtiles' });
map.addLayer({
  id: 'parcel-fill',
  type: 'fill',
  source: 'parcels',
  'source-layer': 'parcels',
  minzoom: 14,
  paint: { 'fill-color': '#d9a441', 'fill-opacity': 0.15, 'fill-outline-color': '#a8452f' }
});
```

---

## 6. Color and classification

**Palette type follows data type:**

- Sequential (low → high): price, density, age. One hue ramp.
- Diverging (below ← neutral → above): change over time, deviation from median. Two hues, neutral midpoint pinned at the meaningful zero.
- Categorical (types, statuses): maximum 7 distinguishable hues; beyond that, group into "other".

**Rules:**

- Use a perceptually uniform ramp (viridis, magma, or ColorBrewer). Never rainbow — it invents boundaries that are not in the data.
- Check for color-vision deficiency; do not encode a critical distinction by red-vs-green alone.
- **Classification changes the story.** Quantile fills the map evenly and hides outliers; equal interval preserves true spacing but often produces one dark blob; Jenks natural breaks finds real clusters. Whatever you choose, name it in the legend.
- Fix the breaks when comparing across time or panels. Recomputed breaks per frame make every frame look identical.
- Clip extremes at the 1st/99th percentile so a single €12M villa does not eat the whole ramp.
- Represent "no data" and "suppressed (n too low)" as distinct, visibly non-value fills (hatching, or a light grey with a legend entry each). They are not zero.

---

## 7. Interaction patterns that make it feel like a product

| Pattern | Why it matters |
|---|---|
| **Draw-a-shape search** | The single most-loved feature on listings maps. People think in neighborhoods, not rectangles. |
| **Map ↔ list sync** | Hover a card, the pin lifts; hover a pin, the card scrolls into view. |
| **Filters as chips** | Every active filter visible and individually removable; never a hidden state. |
| **Save this search** | Turns a session into a returning user. Persist the URL state server-side. |
| **Compare tray** | Pin 2–4 properties, compare side by side, keep them highlighted on the map. |
| **"Why this price?"** | Show the comparables that drive an estimate. Transparency beats accuracy for trust. |
| **Commute filter** | Isochrone from a user-supplied address, intersected with the results. |
| **Share the exact view** | URL carries viewport, filters and selection. |

---

## 8. Pitfalls

1. **Lat/lon swapped.** `[lon, lat]` in GeoJSON, `[lat, lon]` in Leaflet. This bites everyone once.
2. **Coordinates in a projected CRS treated as degrees.** Points land off the coast of Africa.
3. **Mapping raw counts.** Any count map is a population map. Normalize.
4. **Heatmapping a value.** See §2.5.
5. **Silent centroid fallback.** Precise and approximate points must never look the same.
6. **Recomputed class breaks across panels or frames.** Kills all comparison.
7. **Mercator area distortion.** Fine at city scale, misleading at continental scale.
8. **Tiny-n aggregates.** A €/m² median from 2 sales is noise dressed as a fact. Suppress and disclose.
9. **Publishing exact coordinates of sensitive addresses.** Aggregate or jitter where privacy applies, and check the licence on the underlying data before you republish it.
10. **Basemap fights the data.** Mute the basemap.
11. **All 50,000 points loaded on first paint.** Budget the initial view.
12. **Map-only mobile.** Small screens need a list-first view with a map toggle.
13. **Stale boundaries.** Municipal boundaries change; record the vintage of every polygon set.
14. **No accessible path.** A map alone is not accessible — always ship the underlying table, keyboard-navigable.

---

## 9. Appendix: Serbia / RGZ specifics

Relevant because this project starts from RGZ coordinates.

**Coordinate reference systems**

- **WGS 84 / EPSG:4326** — what every web map wants. Everything must end up here.
- **Web Mercator / EPSG:3857** — tile projection; the library handles it.
- **Modern national system**: ETRS89-based, UTM zone 34N. Commonly cited as **EPSG:8682** (SRB_ETRS89 / UTM zone 34N). Confirm the exact code against the header of your own RGZ export rather than assuming — several near-identical definitions exist.
- **Legacy Gauss–Krüger** (the old state system, still all over older cadastral data): zone 6 with central meridian 18°E in the west, **zone 7 with central meridian 21°E** over most of the country. EPSG candidates for MGI 1901 / Balkans zone 7 include **31277** and **3909** — these differ in datum realization, so pick deliberately and verify against a known control point.

**Gotchas specific to this data**

- **False easting encodes the zone.** Zone 7 eastings carry a leading `7` — values look like `7 4xx xxx`, with northings around `4 8xx xxx`–`5 1xx xxx`. If your easting starts with 7 and is 7 digits, it is zone 7 Gauss–Krüger, not UTM.
- **Axis naming is reversed from GIS convention.** Local surveying practice calls the northing `X` and the easting `Y`. Most GIS software expects `(x = easting, y = northing)`. Half of all misplaced-point bugs on Serbian data are this swap.
- **Datum shift is not negligible.** Going from the old Gauss–Krüger datum to ETRS89/WGS84 without the official transformation parameters leaves errors of several meters — enough to put a point in the neighbor's parcel, which matters a great deal in cadastral work. Use the officially published transformation, not a generic Helmert from the internet.
- **Sanity bounding box** for the country: roughly lon 18.8–23.1, lat 41.8–46.2. Assert it in the pipeline (Step 5).

**Data sources**

- **GeoSrbija** (geosrbija.rs) — the national geoportal: parcels, addresses, orthophoto, spatial plans, plus OGC services (WMS/WFS) you can consume directly from OpenLayers or QGIS.
- **RGZ eKatastar** — parcel and ownership lookup by cadastral municipality and parcel number.
- **RGZ Registar cena nepokretnosti** — the real-estate price register; the authoritative transaction-price source for market analysis.
- **OpenStreetMap** — basemap, streets, POIs, building footprints. Check attribution requirements.
- Always record the licence and the vintage for each layer, and surface them in the UI footer.

---

## 10. QA checklist before shipping

- [ ] Points land inside the country bounding box; zero at (0, 0).
- [ ] Approximate and precise coordinates are visually distinguishable.
- [ ] Every aggregate displays its n; low-n cells suppressed and disclosed.
- [ ] The legend names the metric, the unit, the classification method and the date range.
- [ ] Class breaks are fixed across panels, frames and time steps.
- [ ] The palette survives a color-vision-deficiency simulation.
- [ ] The map reads correctly in both light and dark UI themes.
- [ ] Mobile: list-first with a map toggle; touch targets ≥ 44 px.
- [ ] Keyboard: every control reachable; the underlying table available.
- [ ] URL round-trips viewport, filters and selection.
- [ ] Initial payload under budget; panning holds 60 fps at max data density.
- [ ] Attribution and licence shown for every data source and the basemap.
- [ ] Nothing is published that should not be — check privacy and licence on addresses and prices.
