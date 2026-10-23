# CUPOLA 6.1 — Fact-Locked Daily Earth Editorial

## Editorial promise

The content engine answers a narrow question: **Which independently dated Earth observations, advisories, reports and forecasts did CUPOLA verify for a particular UTC day?** It must NOT claim comprehensive coverage of everything that happened on Earth, real-time imagery from every location, all earthquakes, complete cyclone coverage or a live photograph of clouds.

Two intentional routes, **not yet published**:
- /earth/today — evergreen rolling interface with a genuine UTC "as-of" label, source health, no fabricated total.
- /earth/daily/YYYY-MM-DD — immutable, dated Earth observation report published only after sufficient evidence + review.

The current production sitemap remains **8 URLs**, unchanged. New day records are DRAFT_ONLY and have no route, URL served to users, or sitemap entry.

## Pipeline

1. GitHub Actions at **01:15 UTC daily** asks the existing CUPOLA APIs for the preceding complete UTC day:
   - /api/earthquakes — validated USGS GeoJSON, actual event UTC, reported magnitudes/depths, limited rolling feed.
   - /api/storms — NOAA NHC advisory UTC and its limited NHC basin coverage; forecast tracks are explicitly not observed tracks.
   - /api/wildfires — NASA FIRMS time-tagged thermal observations or GDACS/EONET reported incidents, NEVER conflated.
   - /api/aurora-oval — NOAA OVATION model/forecast from upstream observations, NEVER photographed aurora.
2. Reject failing HTTP endpoints, unverifiable times, stale source snapshots, malformed geographic coordinates and observations that occurred outside the exact UTC day.
3. Lock each fact to an immutable SHA-256 ledger containing its identifier, time, source URL, precise geographic coordinates where known, observational status, explanatory constraints and measurements.
4. The deterministic fact ledger is the **only trusted source of facts**. The code constructs numerical evidence cards; DeepSeek may only propose interpretation and structure.
5. If a repository Actions **DEEPSEEK_API_KEY** secret is configured, the workflow calls the official OpenAI-compatible DeepSeek Chat Completions API with a structured JSON response. Default model: **deepseek-flash** (override with DEEPSEEK_MODEL).
6. An automated guard rejects unrecognized fact references, numeric claims in AI prose, near-duplicate AI copy, thin prose and sensationalized risk assertions. This is a *preliminary guard*, not a proof that all qualitative AI claims are factually true.
7. Each run outputs only an UNPUBLISHED JSON in data/editorial/drafts/YYYY-MM-DD.json, with indexApproved=false and mandatory review flag. A GitHub bot opens/updates an editorial review PR; no SEO URLs change.
8. Editor checks the actual primary sources, CUPOLA source limitations, AI qualitative assertions, screenshot authenticity/age, GSC content usefulness, and historical similarity before a separate publishing PR.

### Important: current source-history limitation

CUPOLA's earthquake API uses a rolling ~24h USGS feed, with a capped selection of up to 180 relevant events. Running after midnight may miss an earlier part of the previous UTC day. Hence the current draft is *selected verified facts*, never a definitive 24-hour worldwide count. Proper exact-day census requires durable ingestion/archiving throughout the day, or a separately validated authoritative historical search endpoint. Do not infer missing counts as zero.

Daily publication must eventually require source-diversity checks, genuine geographic/event context and a stable retained snapshot. Current automated rules require at least three validated facts for a draft, at least five facts from two different scientific feeds for editorial-review eligibility. The reviewer may decline even when those thresholds pass. AI prose is not automatically promoted to publication.

## On-page template, after a real approved report exists

- H1: "Earth on October 23, 2026 — verified observations and scientific context."
- A clearly visible UTC **date** and latest source **as-of** times, no claim of complete global coverage.
- Custom CUPOLA WebP from verified capture pipeline, clearly marked visualization and backed by a manifest describing historical basemap/cloud measurement times. WebP age is NOT observation age.
- Deterministic cards: actual selected events and locations, magnitudes/modes, exact occurrence UTC, links to original source. All numerical claims come from the frozen facts.
- "Why these events matter": DeepSeek-drafted synthesis reviewed by a human; trace each paragraph to specific fact IDs. Where the model cannot support a claim, delete it.
- Coverage / missing observations: separately show OFFLINE, FORECAST, historical, incident-report and observation semantics. Name reporting limitations by source.
- Reproducibility / "How this report was built": observation UTC, publishing UTC, ingestion UTC, report digest, source age and methodology links.
- Unique geographic analyses, relevant satellite/CUPOLA 3D fly-to links, and links to adjacent **approved** days. No automatically duplicated headings or filler.
- DatePublished = actual first publication time after approval; dateModified changes only for substantive reviewed amendments. Never "freshen" an archived page each day.

## Preservation / scale

- A single evergreen today view provides rolling current conditions; daily archives answer an **historical query**, not a keyword-variant of the evergreen page.
- Publish only after meaningful unique event groups and reviewed original analysis. Days with weak or duplicated data remain **unpublished**, not 200-empty indexable pages.
- Keep previous snapshots and editorial text to compare shingles, source IDs and days. The current script compares up to 14 prior stored drafts for near-duplicate language. Extend to semantic similarity and human editorial checking before expansion.
- Hero images/videos use the scene-capture system from site-architecture-v1: screenshot generated by CUPOLA and stored with sourceObservedAt, renderedAt, source modes, SHA and science notes. Video interpolation is simulation unless backed by a real instrument-frame archive.
- After real approval, add the exact canonical URL to the appropriate sitemap shard and update internal hub links. Do not publish all dates from a code-generated date range.

## Setup

In GitHub repository Settings -> Secrets and variables -> Actions -> New repository secret:
- Name: DEEPSEEK_API_KEY
- Value: personal DeepSeek platform API key (never commit or include in screenshots)

Ensure Actions has permission to create pull requests via repository Actions settings (GitHub can disable this). No API key means **factual draft only** with editorialStatus=awaiting-ai-secret, never fabricated fallback text.

Manual smoke: run the "CUPOLA Daily Earth Editorial Draft" workflow with no day override. It uses the previous complete UTC day; historical backfills without retained source observations are rejected. A scheduled run follows daily at 01:15 UTC. GitHub Actions scheduling may start later than the cron timestamp.

Run local unit tests: node scripts/editorial/test-daily.mjs.

## Integrity and SEO boundaries

- Secret exists only in GitHub Actions environment; never place it in Next.js NEXT_PUBLIC_* values, client components, an unauthenticated Worker route or source control.
- Model can propose text but cannot read arbitrary tools, fetch web pages, change the fact ledger, push directly to production or index pages.
- Source names and title-like fields from upstream API are data, never trusted instructions.
- Failing scientific endpoints produce missing-source notices. They are not "no global activity" evidence.
- The USGS feed magnitude threshold, NHC basin coverage, incident-vs-detection split, aurora forecast validity are disclosed on the eventual page.
- Never use imagery scene timestamp as evidence that 2004 NASA Blue Marble land pixels or historical lights were acquired today.
- AI generation without content value, citation and editorial oversight can create Google scaled-content abuse risk. Automated production is not equivalent to search value.

Official docs: https://api-docs.deepseek.com/api/responses
Google: https://developers.google.com/search/docs/essentials/spam-policies
