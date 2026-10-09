# CUPOLA Scientific Cloud Engine V3

## Status — real GOES + Himawari ingestion verified, globe not switched

V3 is deliberately **not connected to the production globe**. The live rendering
path remains unchanged on this branch. GitHub Actions now *separately verifies*
real NOAA GOES Level-2 ACM/DQF and Level-1b Band-13 data, plus real JMA/NOAA
Himawari-9 Level-1b AHI Band-13 data. This does NOT mean V3 is cloud-only ready.

The current V1/V2 flow guesses cloudiness from RGB colours in IR/VIIRS imagery.
V3 replaces that interface with `lib/earth/scientificCloudAtlas.ts`.

### Authoritative scientific sources

- GOES-R **ABI Level 2 Full Disk Clear Sky Mask**: `ABI-L2-ACMF`.
  Four official classifications: confidently clear, probably clear,
  probably cloudy, confidently cloudy. Obtain the granules from NOAA Open Data,
  decode cloud mask / quality / projection metadata in a dedicated worker.
  https://www.noaa.gov/nodd/datasets
- NASA VIIRS NOAA-21 cloud mask `CLDMSK_L2_VIIRS_NOAA21`, plus corresponding
  NOAA-20 / SNPP L2 swath products. Swaths carry Cloud Mask, Quality Assurance,
  geolocation and scan start time fields.
  https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/CLDMSK_L2_VIIRS_NOAA21

### First executable NOAA ingestion stage

This branch includes real science-file ingestion scripts (Python, separate from
Cloudflare Workers):

```bash
python -m pip install -r scripts/cloud-science/requirements.txt
python scripts/cloud-science/fetch_goes_acmf.py --satellite east --output-dir /tmp/cupola-granules
python scripts/cloud-science/decode_goes_acmf.py /tmp/cupola-granules/<actual-granule>.nc --output /tmp/cupola-acmf.npz
```

The fetcher discovers the most recently published public NOAA S3 `ABI-L2-ACMF`
full-disk file. The decoder checks product identity, `ACM` (cloud classification),
`DQF` (enterprise good-quality flag 0), projection and acquisition interval.
It uses the official fixed-grid geostationary projection instead of interpreting
scan pixels as latitude/longitude. It outputs a 2048×1024 compressed NPZ
with cloud classification, quality and *granule midpoint approximation* time.

**Not yet connected to the rendering path.** This step does not prove live
coverage or enable V3. A source-level build does not exercise NOAA S3 or Python.

Before enabling: verify the downloaded product and ACM/DQF mapping against
known science products, decode scan-line timestamps instead of using a granule
midpoint, and implement other-source decoders (VIIRS, Meteosat, Himawari).
The browser must not ingest huge raw NetCDF files.

### Verified Himawari-9 full-disk acquisition (October 2026)

Real public-source upstream: JMA Himawari-9 AHI-L1b-FLDK, mirrored in
`s3://noaa-himawari9` (https://registry.opendata.aws/noaa-himawari/).
NOAA/JMA attribution is required; processing must not imply their endorsement.

```bash
python -m pip install -r scripts/cloud-science/requirements-himawari.txt
python scripts/cloud-science/fetch_himawari_ahi.py --all-segments --output-dir /tmp/himawari \
  > /tmp/himawari-manifest.json
python scripts/cloud-science/decode_himawari_ahi.py \
  --manifest /tmp/himawari-manifest.json \
  --output /tmp/himawari-band13.npz \
  --preview /tmp/himawari-band13-temperature.png \
  --coverage-preview /tmp/himawari-coverage.png
```

The independent GitHub Actions workflow
`.github/workflows/science-himawari-smoke.yml` has fetched all **10
synchronized** real Band-13 HSD segments and used Satpy to calibrate
brightness temperature and reproject into a WGS84 2048×1024 grid. At
2026-10-09 22:50 UTC scan slot, the decoded valid coverage was 643,096
global cells (30.665%); observed temperatures ranged from 187.77 K to
305.11 K. The exact observation time is NOT known per output pixel.

**Critical:** Band-13 brightness temperature also observes *clear land and
ocean* and must never be used as an implicit cloud mask. Cloud-only graphics
now use the **separate AHI-CMSK Level-2 product** described below. The
30.665% older L1b coverage figure belongs to the first resampler and has
been superseded by validated antimeridian-safe reprojection. Satellite
coverage fractions must not be added directly because footprints overlap.

### Validated Himawari-9 Level-2 cloud-mask diagnostic

The scientific workflow now also discovers original
`AHI-L2-FLDK-Clouds/.../AHI-CMSK_v1r1_h09_s*.nc` in public NOAA S3,
checks metadata using HDF5 byte-range requests, and processes its real
`CloudMask` and `CloudMaskQualFlag` arrays.

- The current source reports **CloudMask flag values**:
  0=clear, 1=probably_clear, 2=probably_cloudy, 3=cloudy;
  native fill=-128. Only QA=0 and classes 0–3 are admitted.
- All 10 native JMA HSD Band-13 segments must belong to the same scan.
  Incomplete newest scans are skipped until a complete synchronized disk
  is available. The source AHI-CMSK scan must match its L1b observation
  start within 10 minutes.
- L1b geolocation uses direct inverse projection on the native JMA
  fixed grid. The QA cloud mask maps through those same native HSD pixels.
  Twelve real NOAA L2 Latitude/Longitude samples were checked against
  world-grid positions before admitting the 2026-10-09 23:00 UTC scan.
- Confirmed QA-screened L2 observations covered **34.711%** of the
  2048x1024 grid; real cloud classes 2 and 3 covered **23.388%** of the
  global grid. No cloud alpha was emitted outside observed cells.
- Separate diagnostic outputs: `himawari9-cloud-only.png`,
  `himawari9-cloudmask-qa-coverage.png`, and the **unfiltered scientific**
  `himawari9-science-classes.png` (0/1/2/3 mapped to 0/85/170/255,
  alpha only where QA is valid).
- Direct comparison of the diagnostic PNGs identified a **source-level
  class-2 ("probably cloudy") plateau**, roughly 20 pixels wide, near
  the disk limb. It appears unchanged in the *raw* scientific classes;
  it is not caused by PNG alpha or geographic reprojection.
- The **visual cloud preview only** now uses a horizontally wrapped
  2px Gaussian neighborhood and class-specific view-angle attenuation:
  52px near-limb taper for category 3, stronger 72px taper starting
  8px inside the observation footprint for uncertain category 2.
  It is a *visual confidence* heuristic, NOT official NOAA QA or
  a physical cloud probability. It changes neither the source L2
  class array nor official clear-sky labels. Confirmed-clear (0/1),
  bad-quality, and unobserved pixels always have zero cloud opacity.
- Additional diagnostic: `himawari9-view-confidence.png` shows the
  *rendering-only* confidence taper. The raw class map remains exported
  independently to distinguish NOAA classifier artifacts from
  renderer artifacts.
- The preview's opacity is a display-only choice derived from classes and
  Band-13 contrast; **it does not measure cloud optical depth**.
- This is **not** a continuous scheduled multi-satellite production pipeline;
  no source is switched on in Cinema/Explore or merged into the GOES atlas.

Sample verification artifacts are produced by
`.github/workflows/science-himawari-smoke.yml`; both the L1b-thermal
and the L2-cloud-mask tests run against real NOAA/JMA network sources.

### Required ingestion pipeline before enabling V3

1. Retrieve official L2 granules and verify the published product, checksum,
   frame start/end time, and decoder version. Never substitute RGB screenshots.
2. Decode classification, quality flags, scan-line acquisition time and
   per-pixel latitude/longitude with an explicit product-specific mapping.
3. Map into `ClassifiedSwath`. Pixels with invalid QA or missing geolocation
   are omitted; the decoder must never invent coordinates or timestamps.
4. Run `composeScientificCloudAtlas`; encode cloud probability, coverage,
   source and freshness into separate GPU channels. Maintain acquisition
   timestamps out-of-band for telemetry. Handle cross-dateline footprints and
   compare GOES/VIIRS classification consistency.
5. Validate completeness and geography against official cloud-mask imagery
   before exposing the new atlas to Cinema / Explore.

### Current limitations

- The NOAA GOES pipeline now downloads/decodes real ACMF NetCDF granules; it still lacks accurate per-scanline timestamps, parallax correction, and operational background ingestion.
- The Himawari-9 pipeline now decodes JMA HSD and matches a real NOAA AHI-CMSK L2 four-class mask; scientific cloud classification is validated in an isolated smoke test, but optical depth and operational ingest still require implementation. EUMETSAT scientific ingest is pending.
- VIIRS date-only browse composites do not contain the individual cloud-mask
  observation times required by the scientific ingestion contract.
- GOES/VIIRS classify clouds; deriving cinematic transparency, optical depth
  and temporal motion requires additional products and QA.
- A 2048x1024 atlas is a display texture, not a 750-meter-resolution output.
- Unobserved cells are always left missing. No static fallback is introduced.

### Safety

Do not enable V3 for users until at least one tested product decoder emits
verified swaths and side-by-side coverage diagnostics demonstrate fidelity.
This is an additive branch-only foundation. Main, Cinema and the existing
cloud shader remain unchanged.
