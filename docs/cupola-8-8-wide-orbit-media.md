# CUPOLA 8.8 — wider original Earth photos

The original 1.56R sunrise camera and interactive Explore scene are unchanged.
This update adds an **isolated 4.15 Earth-radii camera** exclusively for
`/explore?capture=1&hero=sunrise&captureShot=wide`, used by the Earth Atlas
photo preset `from-orbit-feature`.

- Earth angular half-radius is approximately 13.94°, corresponding to roughly
  66% of frame height at the camera's existing 41° vertical field of view.
- Camera follows the actual Earth-fixed UTC solar direction and exposes about
  68% of the visible hemisphere to sunlight; the physically correct solar
  disc need not appear in this wide cloud-focused still.
- No reprojected satellite clouds, no AI reconstruction, no extra sharpening,
  no fake observational resolution. Pulling back merely reduces the visible
  size of coarse observed pixels, improving the apparent composition.
- GitHub candidate manifest records live WebGL measured Earth distance,
  angular radius, Earth projected center, daylight fraction and timestamp.
- The science gate **rejects old 1.56R near-Earth stills**, even when old
  Cloud V3 data was valid. Home WebM stays on the original cinematic sunrise
  setup, independent of the Earth Atlas photo.
- Trigger `CUPOLA 8.8 Wide-Orbit Original Media QA` only via the committed
  one-shot request file, then verify real `*.webp` and its science assessment.
- A successful GitHub job is not a science/editorial approval. If the current
  GPU cloud layer is fallback, this is blocked from R2 and Atlas.
- After human reviews, a separate `scene-reviews.json` Git-approved entry
  permits the existing protected R2 publication workflow; this is **not**
  generated automatically or pre-signed by the assistant.

A wider camera cannot recover information missing from NOAA/GOES/Himawari/
Meteosat raster footprints or replace cloud compositing quality work.
