# CUPOLA 8.5 — Original scene media to Atlas

This is a **fail-closed** pipeline. It does not produce satellite photos, nor does
it confuse a camera render time with the observation time of an input dataset.

## Current architecture

1. `cupola-original-scene-candidates.yml` captures daily candidates from the
   actual /explore Three.js scene. `workflow_dispatch` also works for manual
   capture; `cupola-scene-capture.yml` supports stills and eight-second videos.
2. Each artifact contains `*.webp`, `*-og.webp`, optional `*-8s.webm`, a
   candidate JSON manifest, and `*-science-assessment.json`. Candidates
   **never** write to the site or R2.
3. The science gate requires an actual GPU-applied verified Level-2 cloud atlas,
   observed source time within 24 hours of capture, valid checksum, valid solar
   camera, and **exact matching** checked-out and deployed renderer commits.
   Coverage is recorded as a **regional observed footprint**, not as proof of
   a globally live image. Visual-only or fallback clouds are blocked.
4. Review the still/video and its manifest: correct geography, Earth fully
   rendered (not stars alone), cloud observation source/freshness, source-age
   disclosure, any seams/artifacts, accurate alt text, and no misleading claim
   of a live satellite photograph.
5. Add a review to `data/editorial/scene-reviews.json` via human-reviewed PR,
   referencing the **exact** capture checksum. Until the review exists, the
   publication workflow refuses the candidate.
6. Run the `CUPOLA Reviewed R2 Media Publish` workflow manually with the
   source GitHub Actions run ID, artifact name and matching preset. It requires
   the **protected** `cupola-media-publication` environment. It validates the
   original bytes, uploads to immutable R2 keys, verifies the public CDN, then
   opens a **new PR** updating the Atlas asset registry. No auto-merge.
7. Once that PR passes the site and Cloudflare builds and is merged, Atlas
   uses the approved `media.cupola.earth` WebP/WebM; the live Three.js /explore
   scene remains independent.

## Cloudflare and GitHub operator configuration

Create an R2 bucket (suggested: `cupola-scene-media`) and connect the custom
domain `media.cupola.earth` to that bucket. Avoid public writes or listing.
In GitHub **Settings → Environments**, create
`cupola-media-publication` and configure required reviewers. Put secrets
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` in that protected environment,
and the non-secret variable `CUPOLA_R2_BUCKET` with the bucket name. Limit the
API token to the specific R2 bucket. Do **not** store secrets in Git or
in chat. Ensure repository GitHub Actions settings allow workflows to create
pull requests; this workflow never auto-merges.

Check the **actual** production /explore response header
`x-cupola-revision`: built from `git rev-parse HEAD`. A missing or stale
header means the scene must not be approved. Cloudflare deployment can lag
GitHub main; the next scheduled candidate will eventually match after deploy.

## Human review entry (example only; not approval)

```json
{
  "preset": "from-orbit-feature",
  "assetId": "earth-observatory-cover",
  "heroSha256": "<actual 64-char SHA-256 from capture>",
  "renderedAt": "<exact candidate UTC time>",
  "sceneRevision": "<actual deployed Git SHA>",
  "scienceApproved": true,
  "editorialApproved": true,
  "scienceReviewedBy": "<GitHub username>",
  "editorialReviewedBy": "<GitHub username>",
  "reviewedAt": "<actual UTC review time>",
  "alt": "Original CUPOLA three-dimensional view of Earth's sunlit limb with regional satellite cloud observations.",
  "visualChecks": {
    "earthVisible": true,
    "cloudProvenanceChecked": true,
    "frameCompositionApproved": true,
    "visualArtifactsChecked": true,
    "notRepresentedAsSatellitePhoto": true
  }
}
```

The review entry must match the downloaded artifact, not a future assumption.
If no verified Cloud V3 source is available or a review is absent, leave the
registry empty. The zero-assets state is correct and safer than stock imagery
labelled as CUPOLA science.

## Preset mapping and safe expansion

- `home-hero` → `home-hero` (Home motion/still).
- `from-orbit-feature` → `earth-observatory-cover` (Earth Atlas cover).
- `satellite-atlas-hero` → `satellite-atlas-hero` (predicted ISS scene).

Future geography/event presets must be implemented in the real scene renderer,
with additional observational metadata and regression tests, **before**
appearing in the publishing allowlist. Do not reuse a random Earth screenshot
as evidence of a specific cyclone, wildfire, aurora, or historical event.

Validation: `node scripts/seo/test_scene_media_science_gate.mjs` and
`node scripts/seo/test_scene_media_publication_gate.mjs`.
