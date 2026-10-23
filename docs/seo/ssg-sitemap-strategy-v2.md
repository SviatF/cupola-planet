# CUPOLA 6.2 — SSG-first Site Map and Publishing Contract

**Status:** architectural render targets for future pages, NOT authorization to put unfinished URLs in the sitemap.
**Production canonical:** https://cupola.earth
**Implementation source of truth:** `config/seo/page-families.json`, including `targetRendering`, `sitemapBucket`, and `contentRefresh`.

## What is really public now?

- `/` — prerendered server HTML context plus a client-only WebGL scene.
- `/satellites` — build-time generated static editorial catalog.
- `/satellites/{slug-norad}` — six approved SSG satellite profiles; unknown slugs return 404.
- `/earth/daily/[date]` route code exists but `generateStaticParams()` lists **zero** approved dates today. Therefore **no dated daily page is public** and no date is added to the sitemap.
- Current `/sitemap.xml` lists eight public URLs only. There is NO live multi-sitemap index yet.

## Rendering by content family (42 target route families)

| Category | Canonical patterns | Render plan | Update strategy |
|---|---|---|---|
| Experience | `/` | SSG shell + client WebGL | Scene data updated by independent verified APIs |
| Earth hubs | `/earth`, `/earth/cities` | SSG shell | Crawlable HTML; source timestamps via optional client data |
| Curated city views | `/earth/cities/{iso2}/{slug}` | SSG approved-only | User-specific scientific content and externally generated CUPOLA WebP, publish on explicit approval |
| Satellite Atlas | `/satellites`, `/satellites/{slug-norad}` | SSG | Verified NORAD profiles in build registry, live orbital calculation from separate API |
| Earth conditions | `/earth/clouds`, `/earth/day-and-night`, `/earth/night-lights`, `/earth/weather`, `/storms`, `/storms/{basin}`, `/earthquakes`, `/earthquakes/{region}`, `/wildfires`, `/lightning`, `/volcanoes` | SSG shell / approved-only for regional | Static scientific explanation + timestamp-labelled live component, no unverified values embedded in HTML |
| Space conditions | `/aurora`, `/aurora/{region}`, `/moon`, `/moon/phases`, `/moon/above/{iso2}/{slug}`, `/sun`, `/sunrise-sunset/{iso2}/{slug}` | SSG shell / approved-only for local | Validated astronomical metadata + optional observer-specific fresh model |
| Science and guides | `/learn`, `/learn/{slug}`, `/stories`, `/stories/{slug}` | SSG curated | Rebuild after editorial approval or meaningful new evidence |
| Earth events | `/events/{type}/{source-id}` | SSG approved-only | Only durable sourced event records; no random 200-page for every live alert |
| Daily rolling view | `/earth/today` | Cached SSR + possibly client freshness | Exact observation timestamps and coverage, not full 24h global event census |
| Daily dated archive | `/earth/daily/{YYYY-MM-DD}` | **SSG approved-only** | Immutable verified fact ledger + reviewed DeepSeek interpretation + source-backed WebP |
| Trust | `/about`, `/data-sources`, `/methodology`, `/privacy`, `/terms` | SSG | Edited/infrequent, do not republish dates on every cron |
| Private | `/api/*`, `/__capture/*`, `/render/*`, `/admin/*`, `/preview/*`, `/eclipse-lab` | Protected / noindex, NO sitemap | API/R2 capture only; unrelated to organic HTML pages |

### SSG vs real-time: separating static HTML from live enrichment

Generate **indexable answers in HTML at build time** with `generateStaticParams()` from an approved content registry; require `dynamicParams = false` for reviewed finite dynamic collections. Provide an initial WebP image with valid `renderedAt` + `sourceObservedAt`, and explain the instrument/camera limits in HTML. The optional live panel fetches current conditions in browser separately. Its failure does **not** delete page content, imply zero events or rewrite the historical article.

Do not rebuild thousands of pages every five minutes because clouds move. For city pages, refresh the externally hosted WebP and its provenance manifest only after a successful deterministic snapshot with verified source age. Static article text remains stable until an **actual editorial/factual change**.

## Publication sequence: fact-locked SSG

1. **Source ingest**: publish immutable UTC day facts and primary URL/time/mode metadata to a fact ledger; weather and orbital models remain distinctly labelled as models.
2. **DeepSeek editorial draft**: receives only selected verified facts; returns structured commentary; never creates numbers, dates, warnings or sources.
3. **Unique value review**: original place/event insights, source diversity, geographic value, meaningfully different from previous reports and from the rolling `/earth/today` page.
4. **Media generation**: CUPOLA captures real scene WebP (`1600x900` for hero; `1200x630` for OG), stores asset and provenance in R2, records rendering versus observation UTC; a generated image alone is NOT proof of up-to-date imagery.
5. **Editorial + scientific approval**: approved registry entry with traceable reviewers, source-ledger SHA, capture manifest and dates. A draft cannot register itself as published.
6. **SSG build**: `generateStaticParams()` enumerates only approved report dates/geoids; unknown dates 404. The per-page canonical, Open Graph, primary source cards, time lag and SSR-readable H1 are produced during build.
7. **Sitemap**: approved new canonical added with meaningful `lastmod` (publication/revision), never every background feed tick. XML sitemap changes atomically with built HTML and internal links.
8. **Post-release**: crawlability smoke + Search Console URL Inspection + daily organic search monitoring. Rebuild relevant static paths upon meaningful reviewed updates.

### Special warning: rolling source history

The present USGS feed is a bounded recent selection. One fetch at 01:15 UTC does NOT prove full coverage of the previous UTC calendar day. For a truly complete daily chronicle, persist validated source event observations throughout the day to R2/D1 (e.g., snapshots every 15–60 min appropriate per feed), deduplicate by source event ID, and run the editorial job against this retained daily snapshot. Until then, label everything **selected verified events**, not total Earth activity.

## Sitemap architecture and phases

**Phase A / Current production**

```text
/sitemap.xml
  /
  /satellites
  /satellites/iss-25544
  /satellites/hubble-20580
  /satellites/noaa-20-43013
  /satellites/noaa-21-54234
  /satellites/landsat-9-49260
  /satellites/goes-18-51850
```

**Phase B / Initial expansion**

Continue the same `/sitemap.xml` for the small number of approved URLs; append only accepted `/earth`, `/earth/cities`, first 3–5 reviewed cities and approved `/earth/daily/YYYY-MM-DD` reports. It is fine to use a single sitemap for tens or hundreds of pages. No empty sitemap shards.

**Phase C / Operational shard scale (not yet deployed)**

```text
/sitemap.xml                 # sitemap index replacing a flat XML file
  /sitemap-core.xml
  /sitemap-satellites-0001.xml
  /sitemap-cities-0001.xml
  /sitemap-conditions.xml
  /sitemap-astronomy.xml
  /sitemap-editorial-0001.xml    # /earth/daily approved + /learn + /stories
  /sitemap-events-0001.xml       # durable verified archived events
```

Operational target: ~1,000 URLs per shard for debugging; protocol ceiling per sitemap is **50,000 URLs or 50 MB uncompressed**. Use XML sitemap index only when needed, and atomically update both `robots.txt` and the GitHub production SEO smoke test. Never expose aliases, API, draft date ranges or empty event pages.

## SEO uniqueness controls, not keyword-spam substitution

- One canonical URL answers each search intent: no multiple city variants for 'live X', 'X from orbit' and 'X satellite view'.
- Daily archive needs five or more timestamped facts, two independent source feeds, scientific context, full provenance, editorial review and a verified image. The minimum is a **gate, not a guarantee** of Google-quality content.
- Avoid templated boilerplate across dates. Use the actual changes in Earth observations, context from preceding approved days and a traceable interpretation. DeepSeek prose must receive human factual review.
- The current editor's lexical similarity filter detects some near-duplicates; it does not prove semantic originality. Extend to semantic checks after first 10–20 actual retained reports.
- Source freshness shown as an absolute UTC observation time and delay at compilation. Rendering an image today does NOT update a 2004 or 2016 basemap's acquisition timestamp.
- Don't publish per-minute pages or hundreds of raw event URLs without sustained editorial value. A published URL is a long-term content-maintenance obligation.

## GitHub Actions day-picker failure and fixed behaviour

- Workflow manual input of an **unfinished UTC day** must be reported as `NOT READY`, with the earliest valid UTC timestamp. No data fetched, no report and no review PR. It must not silently substitute a different date.
- **Blank manual date** means prior completed UTC day. Explicit completed recent day is accepted; older than rolling retention is skipped with an archival requirement.
- Scheduled report runs at 01:15 UTC for yesterday, with fixed policy and no accidental publication.
- The GitHub Action's DeepSeek secret belongs in GitHub Actions repository secrets. A separate Cloudflare Worker secret is only needed if a Worker actually calls the model, which this pipeline does not.

## Important implementation rule

An item in `config/seo/page-families.json` is a **planned template**, not a newly deployed route. `targetRendering` describes the intended system when the route is implemented. The only production sitemap URLs are those actually emitted by `app/sitemap.ts` and approved via the content registry.

References: https://nextjs.org/docs/15/app/api-reference/functions/generate-static-params and https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps
