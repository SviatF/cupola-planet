# CUPOLA 6.0 — Site Architecture & Programmatic SEO Blueprint (V1)

**Status:** architecture approved for engineering review, not approval to publish every URL.  
**Canonical site:** https://cupola.earth  
**Target audience:** English-first, international.  
**Principle:** useful Earth/space answers backed by observation, computation, context and a navigable CUPOLA globe. A scene screenshot alone is NOT sufficient to justify indexation.

## 1. Audit of actual routes in main (23 October 2026)

**Indexable / already published (8 XML entries):**
- `/` — main 3D Earth experience and SSR explanatory content.
- `/satellites` — curated satellite atlas.
- `/satellites/{slug-norad}` — exactly six reviewed profiles: ISS, Hubble, NOAA-20, NOAA-21, Landsat 9, GOES-18.

**Existing but excluded:**
- `/eclipse-lab` — experiment (robots disallow + existing noindex layout).
- `/api/*` — machine data, no ordinary search pages.
- The site already contains forecasts, earthquake/storm/wildfire/aurora/volcano feed clients, orbital math and cloud science, but these are **not** yet distinct indexable editorial routes.
- `/robots.txt` and `/sitemap.xml` already exist. Keep the initial eight-entry sitemap intact until individual pages pass quality gates.

**Machine-readable source of truth:** `config/seo/page-families.json`.  
**Candidate-only city inventory:** `data/seo/city-page-candidates.json`.

## 2. Canonical public site map — target information architecture

```text
cupola.earth/
├── /                                  LIVE — interactive Earth globe
├── /earth                              PLANNED — Earth Observatory hub
│   ├── /cities                         PLANNED — searchable curated directory
│   │   └── /{iso2}/{city-slug}         PILOT — city view / unique Earth context
│   ├── /clouds                         PLANNED — cloud science, observations / model
│   ├── /day-and-night                  PLANNED — terminator / local solar geometry
│   ├── /night-lights                   PLANNED — VIIRS vs historical radiance
│   └── /weather                        LATER — weather from space
├── /satellites                        LIVE — atlas
│   └── /{satellite-slug-norad}         LIVE — 6 published, expand selectively
├── /storms                             PLANNED — cyclone monitoring
│   └── /{basin}                        LATER — only where source coverage exists
├── /earthquakes                        PLANNED — recent seismic activity
│   └── /{region}                       LATER — if historical/region detail adds value
├── /wildfires                          PLANNED — NASA FIRMS detections and caveats
├── /lightning                          PLANNED — observed GLM vs forecast
├── /volcanoes                          LATER — incident reports, not a live video
├── /aurora                             PLANNED — NOAA OVATION forecast
│   └── /{region}                       LATER — unique regional probability/conditions
├── /moon                               PLANNED — phase and illumination
│   ├── /phases                         PLANNED — sourced phase guide
│   └── /above/{iso2}/{city-slug}       LATER — observer-specific angle after QA
├── /sun                                LATER — solar geometry
├── /sunrise-sunset/{iso2}/{city-slug}  LATER — observer/timezone verified
├── /learn                              PLANNED — evergreen science explainers
│   └── /{article-slug}                 CURATED only
├── /stories                            LATER — editorial Earth observation stories
│   └── /{story-slug}                   CURATED only
├── /events/{type}/{source-id}          CONDITIONAL — archived verifiable event
├── /about                              PLANNED — identity / editorial responsibility
├── /data-sources                       PLANNED — provenance / coverage / cadences
├── /methodology                        PLANNED — SGP4, cloud mosaic, basemap
├── /privacy                            PLANNED — actual legal policy
├── /terms                              PLANNED — actual terms
└── TECHNICAL — NEVER index /api, /__capture, /render, /admin, /preview, /eclipse-lab
```

Route conflicts are avoided: `/earth/cities/{country}/{city}` is the ONLY city Earth view path. Do not simultaneously publish alternate `/earth-above/lviv`, `/city/lviv` or query-string variants. City locale and state collisions require an authoritative geographic ID; use a distinct slug only when necessary and redirect old URLs. Generic city paths are not enabled merely because a record exists.

## 3. Ranking priority and real user value

| Sequence | Cluster | What makes a useful page | Capture |
| --- | --- | --- | --- |
| 0 — shipped | Home + Satellite Atlas | 3D experience, orbital motion, sourced mission facts; finite curated catalog | Existing WebGL |
| 1 | `/earth`, `/earth/cities`, 8–12 city pilot | City-centered scene + geographic context, solar day/night, verified observational coverage/time, observer-friendly explanation, related orbit/events, source notes | 1200×630 WebP + 1600×900 WebP |
| 2 | `/earth/clouds`, `/earth/day-and-night`, `/earth/night-lights` | Verified GOES/Himawari imagery vs models vs historical background; clear data age/coverage | Selected globe + source maps |
| 3 | `/aurora`, `/earthquakes`, `/storms`, `/wildfires`, `/lightning` | Human-usable filters, provenance, relative times, return to 3D globe, historical context | Event-specific or map frame |
| 4 | `/moon`, `/moon/phases`, `/sun` | Verified ephemeris, phase, terminator, careful observer-based interpretation | Accurate calculated scene |
| 5 | Guides, regional pages, additional cities and satellites | Only if GSC query demand + unique data/analysis + quality gate passes | Optional |
| Conditional | Long-lived event pages and video | Retained source record, attributable observation, event explanation, content maintenance | Captured scene + actual temporal archive |

Start with **a dozen city candidates**, publish 3–5 individually verified pilots, then the remaining pilots if rendered quality/data passes. Do **not** add 500 cities or 17k NORAD records to XML automatically.

## 4. Per-city template — useful even WITHOUT a screenshot

**Example:** `/earth/cities/ua/lviv`

- H1: **Earth above Lviv — clouds, daylight and satellite context**.
- Hero: CUPOLA-generated image. The scene's `renderedAt` is shown **separately** from any cloud or instrument `observedAt`. A screenshot of an Earth model is NOT a live photograph.
- Snapshot card: geolocation and zoom; day/night at capture; cloud dataset version, footprint, actual observation UTC (if available); model/fallback status.
- What is happening above this city: sourced regional conditions or the honest `not currently available` state, not a generic fabricated summary.
- Visual explanation: which pixels represent observed clouds, which use a model, which come from a historical surface texture, what distance/scale the camera simulates.
- Scientific context: why orbit coverage/daylight differs at this place; link to full methodology and relevant primary provider.
- Satellite panel: computed nearby satellite positions if fresh, **not** claimed to be physically observable passes.
- Nearby verified Earth events if spatial/temporal match exists; do not inflate unrelated events.
- Interactive link to focus this city in CUPOLA globe, using validated coordinates. Internal links to parent hub, geographically relevant neighbor pages, related source/methodology.
- FAQ only when actually answers common city-specific questions. No autogenerated FAQ rich-result claims.
- Mobile readable SSR text and image with alt; WebGL lazy and OPTIONAL.

**Publication threshold:** a real geodata identifier, coordinates+timezone, unique explanations/data, source chronology, generated asset or meaningful source figure, finite QA and a successful crawler-visible HTML test. Where data is insufficient, page stays unpublished, noindex, off sitemap, or 404; do not make a 200-page shell for all city slugs.

## 5. Taxonomy of facts / time

| Field | Meaning | Example |
|---|---|---|
| `renderedAt` | When CUPOLA produced this frame | UTC timestamp |
| `sourceObservedAt` | When instrument measured underlying source | GOES/JMA timestamp, nullable |
| `sourcePublishedAt` | When product became available | Origin publisher UTC |
| `computedAt` | When solar/SGP4 position was calculated | Computation UTC |
| `modelValidAt` | Forecast time to which model applies | GFS/OVATION UTC |
| `basemapVintage` | Age/origin of ground textures | NASA Blue Marble, historical |
| `coverageFraction` | Genuine observed coverage, not full-screen pixels | 0–1 or null |
| `renderMode` | Actual screen mode and camera/zoom preset | city-hero-v1 |
| `sceneRevision` | Code / shader version used for screenshot | build git SHA |
| `sourceStatus` | Observed / model / visual / stale / unavailable | Explicit label |
| `humanReviewedAt` | Approval for publication, not observation freshness | UTC |

**No false LIVE:** The SUN/MOON are computed, aurora forecast is predictive, satellites are propagated SGP4 orbits, cloud observation is near-live where supported, surface/night pixels may be historical. Re-rendering a synthetic hero today does not reset the observation's date.

## 6. Media generation contract

1. Start with a **deterministic camera preset** keyed by city geographic ID and capture type (hero, OG, social portrait). Reuse real CUPOLA shaders/layers; do not screen-grab random user sessions.
2. Authenticate internal capture endpoints. No public anonymous render API or uncontrolled latitude/longitude/video jobs.
3. Headless Playwright with WebGL GPU availability checks, `sceneReady`, loaded layer state, and fixed viewport/dpr. Fail closed if the scene did not initialize or if requested observation products are invalid.
4. Produce WebP assets at `hero 1600×900` and `OG 1200×630`; store in versioned, immutable Cloudflare R2 keys (or equivalent) rather than committing thousands of binary files to GitHub. Use descriptive alt and a lightweight placeholder.
5. Persist an atomic asset manifest: city/source/camera data, `renderedAt`, `sourceObservedAt`, `basemapVintage`, hashes, image dimensions, original content IDs, review/validation status.
6. Only after successful validation publish the manifest pointer. Old validated asset stays active on a renderer failure but is labelled with its real age. No future/pseudo-live timestamp overlay.
7. Page SSR reads the last approved asset; rendering itself happens in a scheduled CI/render job, NEVER in the visitor's HTTP request path.
8. For articles: editorial record references the same asset manifest; do not take a fresh WebGL screenshot on every page view.
9. **Video phase:** actual video from camera motion labelled `simulation/cinematic`; historic cloud timelapse needs independently archived time-sequenced source frames with original acquisition times. Encode MP4/H.264 + poster WebP; R2/CDN served, with playback opt-in on mobile.
10. Enforce rate limits, access control, daily quotas, scene readiness and R2 retention. Do not make the browser upload screenshot on behalf of anonymous visitors.

## 7. Publication state machine

```text
CANDIDATE → GEODATA_VERIFIED → SOURCE_QA → RENDERED → CONTENT_REVIEWED
     → READY_FOR_INDEX → PUBLISHED → MONITORED
             ↘ REJECTED / SOURCE_UNAVAILABLE / NOINDEX
```

The sitemap reads **only** `PUBLISHED` + `indexApproved=true` records. For the pilot, the existing eight published URLs remain the entire sitemap. A city candidate or rendering asset alone cannot open an indexable URL. Retire/unpublish routes using a 404/410 or relevant 301 based on permanence; never point multiple city URL forms to identical content.

**Technical noindex:** `/__capture/*`, `/render/*`, `/admin/*`, `/preview/*`, `/api/*`, `/eclipse-lab`. Do not rely only on robots.txt to suppress indexed URLs: protect internal endpoints and return appropriate noindex/auth responses.

## 8. XML sitemap evolution

**Now:** `/sitemap.xml` includes exactly 8 canonical entries (verified in GitHub production smoke). Avoid falsely assigning `lastmod = now()` to every page on each feed tick.

**Later:** shard independently by page class to debug crawl/indexation:
- `sitemap-core.xml`
- `sitemap-satellites.xml`
- `sitemap-cities-0001.xml`, etc.
- `sitemap-conditions.xml`
- `sitemap-astronomy.xml`
- `sitemap-editorial.xml`

Serve an index at `/sitemap.xml` **only when** switching to multi-file mode, updating public smoke tests atomically. XML single-file protocol limit: 50,000 URLs or 50 MB uncompressed; CUPOLA operational target 1,000 URLs/shard for easier isolation. Use meaningful `lastmod` based on substantial editorial/data changes, not the screenshot render time alone. `image:image` and video extensions may be added when valid assets exist; do not add nonexistent media links. Render endpoints and draft assets never enter a sitemap.

## 9. Conversion, IA and navigation

Global nav: **EARTH / SATELLITES / EARTH EVENTS / MOON & SUN / LEARN**, plus **EXPLORE 3D**. On mobile, collapse nav but keep ordinary crawlable anchors. Each hub provides an overview, links to indexed children, scientific provenance and CTA into CUPOLA. Individual pages include breadcrumbs and links back to hub.

Don't create multiple pages merely for keyword variations (`live earth above X`, `X from space now`, `X satellite photo`). One canonical page covers the intent honestly. Do not add a city page solely from a placeholder image and a generic city name substitution.

## 10. Execution plan

- **Architecture PR:** versioned route taxonomy + unpublished seed cities + CI consistency guard; no SEO URL count change.
- **Capture PR:** deterministic scene camera and `sceneReady` event, headless WebP generation, R2 asset manifest, security/rate-limit, golden reference screenshot tests.
- **First content PR:** Earth and Cities hubs + 3–5 vetted city pages with server HTML and reviewed assets; sitemap gate to those published only.
- **Expansion PR:** 12 vetted cities and next science hub(s) after Search Console evidence.
- **Video PR:** only after source-frame archive and retention decisions.

### External standards
- Google site and sitemap: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- People-first content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Scaled content abuse: https://developers.google.com/search/docs/essentials/spam-policies

**Release checklist:** CI build + camera QA + visual QA + source age + reviewed fact text + canonical + noindex/404 + mobile HTML + sitemap diff + first GSC crawl feedback. No automatic mass indexation.

## Daily editorial extension (CUPOLA 6.1)

The daily fact-locked DeepSeek editorial pipeline was merged separately in commit 1a04c87. The two planned daily families in config/seo/page-families.json are /earth/today (evergreen rolling report) and /earth/daily/[date] (approved historical UTC snapshots). The HTML template already exists and 404s until a source-verified, human-reviewed day is explicitly placed in the approved publication registry. Unreviewed JSON remains outside the sitemap. See docs/seo/daily-earth-editorial-v1.md.
