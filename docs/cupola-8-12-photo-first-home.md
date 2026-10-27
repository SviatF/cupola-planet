# CUPOLA 8.12 — photo-first homepage, full observatory in Explore

## Why

Repeated camera tweaks did not fix the editorial problem: homepage iframe rendered
initially from its default near-India Explore camera and snapped to the homepage
camera after startup; clouds looked dark gray when most of the globe was unlit.
No feature is allowed to claim that nighttime clouds are white, or to synthesize
new NOAA imagery to improve the picture.

## Deliverable

- `LiveHeroScene` first checks the **approved, immutable**
  `home-cover` asset in `data/editorial/scene-assets.json`.
- Only if that strict asset exists, the homepage renders its original WebP
  via an LCP-friendly, responsive still rather than spinning up an extra WebGL
  renderer. The badge says `CAPTURED ... UTC`, never LIVE.
- Before human science and visual approval, the manifest remains **empty**.
  The same live original WebGL fallback is retained without claiming that
  it is a reviewed photo. Its default Explore camera first frame is hidden
  until the editorial camera and renderer report readiness.
- The separate `home-cover` capture preset uses a **4.15R** whole-disk
  **68% sunlit** camera, so clouds on the sunlit half are naturally white
  rather than darkened by night lighting. The real Sun stays outside this
  daylight cover's photographic frustum; do not paste in a stock Sun.
- Its one-shot GitHub Actions workflow records the actual Three.js screenshot,
  SHA256 hashes and scientific source state. It produces only **UNAPPROVED**
  WebP and a science assessment. R2 and the Atlas asset manifest cannot be
  changed by the capture workflow.

## Final editorial gate

Open the original GitHub artifact. Compare globe shape, bright clouds, real
terminator, black/white cloud source mosaic and clean headline crop. If the
science gate reports `SCIENCE_BLOCKED`, do not present it as a currently
observed cloud map. After explicit science + visual approvals, upload the
immutable reviewed WebP and evidence manifest to R2 via the existing protected
media-publisher workflow, then add its exact R2 URL, scene SHA, timestamps,
`approved:true`, and original render attribution to `scene-assets.json`
as `home-cover`. There is NO automatic approval or publication from CI.


## CUPOLA 8.13: user-chosen original Explore frame

The previous 4.15R editorial orbit candidate completed rendering at
2026-10-27T13:58 UTC, but its actual science result was **SCIENCE_BLOCKED**:
`CUPOLA_CLOUD_GPU_OBSERVED_AT_CAPTURE false`, cloud source `visual`,
reported observed footprint `0`, GPU atlas `not-verified`. The workflow
success status reports only capture/artifact completion and must never be
interpreted as scientific approval or permission to publish.

Compare the user's two 27 Oct screenshots: the desired photograph is the
**second screenshot, the normal interactive Explore scene** (large circular
Earth, Sun on left, nighttime city lights), not the separately graded and
off-axis home-only sunrise shot. The old `editorialHero=true` flag altered
opacity/brightness/relief/shadow and passed `cinematic=true` to the cloud
renderer. This is one reason the homepage does not look identical to Explore;
night-side solar illumination also matters. The original scene's exact V3
source state remains independently auditable and unknown until source QA.

The same `home-cover` asset now captures:
- `/explore?capture=1&captureShot=explore` — `editorialDawn=false`, never
  re-grades the clouds, never adds an editorial camera.
- The default `ISS CUPOLA` view's shared `HERO_CAMERA`, `HERO_TARGET`,
  FOV 41, ~3.709 Earth radii, normal Explore-mode Sun and cloud shaders.
- Capture-specific screenshot chrome is hidden and a genuine 3D canvas
  frame is saved as WebP by the existing SHA/source-checking pipeline.
- The browser explicitly certifies `explore-reference-v1`,
  `EXPLORE_UNMODIFIED`, camera radius and position before capture.
- Desktop CSS uses `object-fit:contain;object-position:right center` to
  ensure that a real spherical Earth is not cropped or flattened behind
  the left editorial text. Mobile may crop its portrait region separately.

Only a source-checked, editorially approved asset can enter the homepage.
In particular, **do not bypass the SCIENCE_BLOCKED status simply because
this camera looks nicer**. No duplicate source algorithm or fake white clouds
are introduced, and the actual interactive Explore viewer is unchanged.
