# CUPOLA — NASA lunar atlas / IAU libration calibration

> Scope: experimental PR #110; this note does not assert production activation.

## Scientific model and independent references

- **NASA SVS CGI Moon Kit #4720** is the source of the 4096×2048 LROC sRGB raster and LOLA relief. Its equirectangular map is centred on the **0° lunar meridian**, and its north pole is at the top: https://svs.gsfc.nasa.gov/4720/
- Luna uses the IAU WGCCRE Moon pole RA/Dec and time-dependent prime meridian W from Astronomy Engine, mapped to CUPOLA's terrestrial frame. This is **not** a JPL PCK / full IERS terrestrial solution.
- Five NASA SVS 2026 hourly points independently validate lunar sub-Earth longitudes, latitudes, phase and distance in `scripts/cloud-science/test_lunar_iau_libration.mjs`: https://svs.gsfc.nasa.gov/5587/
- NASA imagery is **fixed**; the light field follows UTC astronomical geometry. The visualization does not create new NASA images for each date.

## Correct texture registration

The Moon body frame is right-handed: `+X` = 90° lunar east, `+Y` = lunar north pole, `+Z` = 0° prime meridian. Three.js's `SphereGeometry` receives a permanent local yaw of `−90°`; the IAU frame rotates the parent group only.

For an east-positive lunar longitude `λ` and latitude `φ`:

```text
u = fract(0.5 + λ / 360)
v = 0.5 + φ / 180
sourceImageX = floor(4096 * u)
sourceImageY = floor(2048 * (1-v))

bodyX = cos(φ) sin(λ)
bodyY = sin(φ)
bodyZ = cos(φ) cos(λ)
```

Canonical control sites (rounding follows floor):

| Landmark | Lunar longitude | Latitude | NASA 4K source pixel |
|---|---:|---:|---:|
| Tycho | −11.32° | −43.37° | (1919,1517) |
| Copernicus | −20.08° | +9.62° | (1819,914) |
| Mare Crisium | +59.0° | +17.0° | (2719,830) |
| Mare Tranquillitatis | +31.4° | +8.5° | (2405,927) |
| Mare Imbrium | −15.6° | +32.8° | (1870,650) |

These are coordinate tie points, **not** proof of automatic computer-vision recognition of crater shapes. The rendered WebGL pixel at each tie point is compared to a *footprint average* over the true decoded NASA 4K raster: one display pixel spans multiple original NASA texels. An east/west-mirrored source pixel is a deliberately incorrect negative control.

## Test evidence and gates

`node scripts/cloud-science/test_lunar_libration_visual.mjs` runs four dates (2026-09-01, 09, 17, 25 UTC) with real Chromium/Three.js software WebGL; it writes four annotated lunar snapshots plus `report.json` under `lunar-libration-evidence/`. The GitHub workflow `celestial-eclipse-gpu-qa.yml` archives them.

Baseline on commit `2f9d778`: **20 of 20** sample pairs, maximum absolute RGB8 channel delta **8.89/255** using 9×9 source-footprint averages (threshold 25). The new mirrored-negative-control gate and enabling IAU by default must each independently pass a **new SHA-bound CI run**; do not assume a previous artifact validates a later commit.

## Preview controls and rollback

- **No query flag**: IAU lunar orientation by default in the PR preview.
- `?celestialLibration=1`: same IAU orientation plus a small debug HUD showing UTC, Earth-facing / camera-facing phase, selenographic sub-Earth longitude/latitude, actual loaded map and source.
- `?celestialLibration=0`: legacy always-Earth-facing orientation for side-by-side atlas review.

The Moon camera may be on the lunar far side. `EARTH VIEW` and `CAMERA VIEW` illuminated fractions differ; that does **not** mean the phase shader is wrong.

## Release restrictions

Do not merge into `main` until current-head scientific, GPU, browser and cloud deployment checks have no unexplained failures; inspect NASA texture, ensure no atlas flip, verify actual hardware FPS, and obtain visual acceptance on a SHA-verified deployment. In case of inaccurate rendering, roll back preview behavior with `?celestialLibration=0` without changing UTC or astronomy sources.
