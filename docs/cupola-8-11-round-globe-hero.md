# CUPOLA 8.11 — Earth must remain round beside the physical Sun

## Root cause, demonstrated from the actual user screenshot

The screenshot of the 80-degree, 30-degree-off-axis 8.10 camera makes a
correct sphere look like a **horizontally stretched ellipse**. This is
the perspective projection of a tangent cone away from the principal
axis, **not** a change to globe geometry or satellite textures.
The exact 3D tangent-cone calculation predicts a pixel ratio of
approximately **1.18** (18% too wide). The previous smoke tests only
checked center projections and completely missed the silhouette defect.

## New camera composition

- Home **desktop iframe only**, still one real Three.js/WebGL scene
- True Earth-center observation distance **1.65 Earth radii**
- True perspective **116-degree vertical FOV**, optical axis tilted
  only **10 degrees toward the physical Sun** rather than 30°
- Keep physical Sun direction, real night lights, Cloud V3 input and
  ~30% illuminated / ~70% night hemisphere intact
- Full planet shifts right of editorial copy, original solar billboard
  remains near the right edge without replacing it with a CSS disk
- The projected globe measures about **1.024 width/height** in genuine
  screen pixels. Geometry is a sphere and remains so in Explore.
- Prior mobile and tablet fallback, interactive Explore, independent
  Atlas captures, Home WebM, Moon and orbital modes are not touched

## Regression guard

Every main build now mathematically projects **144 points from the actual
3D sphere's tangent cone** across solar vectors and viewport sizes
1600×468, 1600×570, 2006×675, 2048×670. The test fails when projected
width/height exceeds **1.035** or falls below **0.99**, checks fully
visible globe boundaries, and verifies the genuine solar disc in the
outer HTML iframe crop.

Production WebGL independently samples **96 tangent cone rays** using
its actual Three.js `PerspectiveCamera` and records the measured
`data-earth-projected-disc-aspect`, `data-earth-rim-min/max-x/y`,
`data-webgl-camera-aspect`, and canvas CSS aspect. The separate
post-deploy screenshot workflow refuses to pass if the globe remains
flattened or cropped, the canvas has uneven CSS pixel scaling, the
true Sun is not visible, or Cloudflare runs an older commit.

Camera calculations are verified in automated tests, not a substitute
for inspecting the actual production screenshot. No R2/Atlas asset
publishing or scientific data modification is authorized.
