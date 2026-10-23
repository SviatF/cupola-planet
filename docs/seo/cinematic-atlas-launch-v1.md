# CUPOLA 7.0 — Cinematic Atlas launch and scene media contract

**PR #140; staging/review until observed WebGL render screenshots are approved.**

## Routing and SEO

- `https://cupola.earth/` — editorial Atlas homepage (SSG HTML + real CUPOLA WebGL iframe in hero).
- `https://cupola.earth/explore` — full interactive Earth 3D experience, not a second globe engine.
- All story and satellite CTAs link to `/explore`; satellite detail uses `/explore?satellite=<NORAD>`.
- `/earth`, `/earth/clouds`, `/earth/day-and-night`, `/earth/night-lights`, `/events`, `/learn`, `/methodology`, `/data-sources` — original science-backed SSG content.
- `/satellites` and existing six approved `/satellites/[slug]` — redesigned editorial directory/profiles, same verified scientific data.
- `/earth/cities` — city candidate directory, **noindex until factual city assets pass QA**.
- `/earth/daily` — list of human-approved reports, **noindex while no reports are approved**.
- `/earth/daily/[date]` — previously built SSG approved-only archive, unchanged science/provenance gate.
- Sitemap count changes from 8 to **17** reviewed science/static URLs; do not add drafts, unverified cities, raw events or noncanonical aliases.

## Visual contract

User-selected homepage and editorial-science concepts are references for layout, typography and color, not evidence of observed Earth phenomena. No stock image, AI illustration, invented real-time hurricane, fabricated data, or invented video is included in the deployed source. A WebGL **render** is never labelled as a direct satellite photograph.

`components/editorial/SceneFrame.tsx` reads `data/editorial/scene-assets.json` with an empty **approved** asset registry. Unapproved image placeholders are intentional until real screenshot assets are checked. The same `CupolaExperience` powers `/explore`, `/explore?embed=1` and the capture-only `/explore?capture=1`.

## Render-to-WebP pipeline (implemented for QA)

1. Run GitHub **CUPOLA Scene-to-WebP Capture QA** after `/explore` is deployed, with `home-hero` or `satellite-atlas-hero` preset. Weekly scheduled capture is also configured.
2. GitHub Actions installs Chromium (Playwright) and the Sharp image encoder. It loads exactly `https://cupola.earth/explore?capture=1` (or the selected NORAD camera context), checks for real Three.js renderer readiness, screen dimensions, WebGL rendering failure and visible pixel contrast.
3. It exports a 1600×900 hero WebP and a 1200×630 OG WebP, plus SHA-256 hashes and a JSON manifest.
4. The GitHub **cupola-capture-qa** artifact contains the resulting files; **none is automatically published**.
5. A reviewer inspects whether the globe is actually visible, coherent, and scientifically plausible; verifies source timestamps from the actual scene feed provenance; checks cloud coverage and whether mixed historical surface data is accurately labelled. If the source time is unverifiable, leave `sourceObservedAt = null` and label the image as a scene visualization.
6. Next phase (not yet configured): publish *approved* immutable files into a Cloudflare R2 bucket and serve via `https://media.cupola.earth` (requires actual bucket, credentials and routing), or commit a small verified scene image under the same first-party domain for the pilot.
7. Only after review, add assets to `data/editorial/scene-assets.json`: `approved:true`, `origin:"CUPOLA_CAPTURE_ENGINE"`, valid `sceneRevision`, real `renderedAt`, truthfully null or verified `sourceObservedAt`, first-party WebP and first-party provenance URL, descriptive alt.
8. CI `scripts/seo/test_atlas_scene_media.mjs` rejects unapproved/foreign-origin or structurally inconsistent asset records. Site can then serve verified frame(s) as hero/covers, OG images or report illustrations.

**Current limitation:** one scene GPU initialization + screenshots does not prove cloud-layer full coverage or date. Pixel contrast proves nonblank output, not geographic truth. Screenshots must not be promoted to LIVE observation imagery without accompanying instrument/source metadata.

## Quality and performance acceptance criteria

- Home page matches core reference structure, typography, spacing and documentary contrast at 1440px/1024px/mobile; verify with real screenshot from preview. A conceptual reference cannot be reproduced pixel-perfect before scene capture produces equally cinematic Earth material.
- `/explore` retains all prior science toggles, Moon, satellites, clouds, orbital data, event detection and 3D camera interactions; opening Atlas does not create another simulation.
- The hero iframe is noninteractive intentionally; the **Explore the Scene** CTA opens the real viewer. Monitor memory/GPU performance on mobile; replace iframe with a source-verified pre-generated WebP plus opt-in video if perf degrades.
- Six satellite profiles preserve NORAD, SGP4 readouts, source URLs, and deep-linked object IDs.
- Next.js and Cloudflare builds pass. Real browser scientific smoke tests target `/explore`, not home Atlas.
- Production smoke verifies 17 canonical public sitemap URLs, source-backed SSR H1 on home/Atlas/ISS, robots, and excludes noindex city/day candidates.
- Capture job produces valid nonblank first-party WebP and provenance metadata; no raw screenshot automatically becomes a published page cover.

## What is not implemented yet

- Approved WebP and short video media **have not been populated** in the registry.
- No Cloudflare R2 bucket binding, image upload credentials or production custom media domain has been configured by this PR.
- No physical 3D scene lighting/texturing uplift can be asserted without side-by-side captured frames.
- No unverified city, event or daily story is created simply to fill an editorial homepage.

After real WebP validation, move through capture-scene visual uplift and editorial media promotion; keep scientific data integrity and crawlability independent of the art direction.
