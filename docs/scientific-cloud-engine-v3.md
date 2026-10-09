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
ocean*. It is NOT a verified cloud/no-cloud classifier. The Himawari
diagnostic PNG must not be repurposed as an alpha-only cloud layer until a
validated cloud mask (e.g., AHI L2 CMSK) or independently validated
multispectral retrieval and QA pipeline is available. The 30.665% coverage
is temperature-data coverage, *not* extra confirmed cloud coverage, and it
cannot simply be added to the GOES percentage because disk footprints overlap.

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
- The Himawari-9 pipeline now decodes real JMA HSD segments, but has no independently validated cloud mask. The EUMETSAT scientific ingestion is also pending.
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
