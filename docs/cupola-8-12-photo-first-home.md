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
