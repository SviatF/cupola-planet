# CUPOLA V3 — Africa/southern-ocean thin-cloud fidelity

## Visual acceptance problem (12 October 2026)

User confirmed the vertical source seam is solved at the **64px native
GMGSI IR limb crossover** (commit `dc021b4`, restored cleanly by `33d23af`).
However, Africa and neighboring ocean sectors do not show the faint layered
gray structure that appears in the QA-screened Level-2 GOES/Himawari sectors.

**Do not re-enable the reverted experiments** `photographedIrWisp`,
`v3IrNightExposure` or widened source stretching. These increased large
rectangular tonal boundaries and even created a bright vertical curtain.

### Observed limitation, not a shader regression

| Source | Native physical meaning | What CUPOLA can infer |
| --- | --- | --- |
| GOES/JMA Level-2 | QA-screened classified cloud/clear, verified geolocation | Authoritative observation in original **65.6%** footprint. Never rewrite, including classified clear. |
| NOAA GMGSI LW | DQF-screened longwave infrared brightness, georegistered global mosaic | Measured *visual* thermal structure; a dark IR visualization pixel **does not imply scientifically clear sky**. It does not independently retrieve cloud optical depth. |
| MSG/MTG styled EUMETView CLM WMS | Categorical color-coded cloud/clear land/clear sea | Observed binary/class label, **not calibrated optical thickness**. WMS resampling/edge and imagery age matter. Not native L2. |
| NOAA GFS | Model cloud cover, latest issued forecast | Model only. Not a satellite photo; never call verified observation. |

The WMS-only current-branch experiment on 2026-10-12 returned a valid
`msg_fes:clm` map but no usable infrared layer (HTTP 204 on attempted IR).
A categorical styled mask contains no within-class gray optical-density
gradient. NOAA GMGSI LW conversion is a single spectral proxy and will not
recover faint warm/thin cirrus reliably in all scenes.

### Current diagnostic, no visual effect

Open an **immutable PR Preview** with:

`?cloudEngine=v3&cloudAudit=sources`

After a new full atlas publication, JavaScript dispatches a
`cupola-cloud-source-audit` CustomEvent with actual world-atlas counts
for **Africa, Atlantic, Indian Ocean and Southern Ocean**. It reports:

- classified L2 and L2-known-clear pixels separately;
- Meteosat categorical WMS, NOAA real LW IR, GFS-model, no-data ownership;
- R=0/near-black vs weak-gray and white-core *display* pixels;
- when **Meteosat reports a cloudy class but valid same-location NOAA IR
  appears dark**, and whether the Meteosat contribution survives in the final
  composite;
- explicit original Level-2 byte-identity gate.

The browser smoke test captures these figures on a SHA-specific Cloudflare
deployment. This diagnostic never changes any atlas byte, shader, coverage
percentage, source timestamp or consumer-facing interface.

### Correct upstream route

Official EUMETSAT near-live science families:

- **FCI-2-CLM**, dataset `EO:EUM:DAT:0678`, 10-minute full-disk;
- **FCI-2-OCA**, dataset `EO:EUM:DAT:0684`, cloud optical thickness,
  phase and other retrieved properties, 10-minute family;
- **MSG/SEVIRI CLM**, `EO:EUM:DAT:MSG:CLM`, 15-minute full-disk;
- **MSG/SEVIRI OCA**, `EO:EUM:DAT:MSG:OCA`, supplemental optical properties.

Cloud optical thickness (or a validated multispectral microphysics
retrieval) can provide a physically meaningful gray density where
retrievable. A binary CLM class alone cannot. At night, individual product
variables, valid QA classes, spatial coverage and optical retrieval
availability MUST be checked explicitly rather than assumed.

There are currently **no EUMETSAT CONSUMER KEY/SECRET secrets configured** in
the test workflow inventory, so authenticated native file download has NOT
been verified and **0 native EUMETSAT cloud-property pixels** are rendered.
Readiness workflow `.github/workflows/science-meteosat-oca-readiness.yml`
checks official dated product *metadata*, and deliberately does NOT
misrepresent successful metadata discovery as scientific imaging.

When EUMETSAT access and an active applicable NRT licence are available,
configure **GitHub Actions repository secrets**
`EUMETSAT_CONSUMER_KEY` and `EUMETSAT_CONSUMER_SECRET` (do not commit or
send credentials in PR comments). Then implement a separately QA-gated
NetCDF ingestion worker:

1. EUMDAC-authenticated exact granule archive/entry and checksum retrieval,
   with limited byte budgets; never guess download URLs.
2. Validate native product/collection identifier, scan start/end, units,
   variable name, fill flags, enumeration definitions and per-pixel QA.
3. Reproject the **actual native geostationary coordinates** to 2048×1024,
   measure the source overlap, and reject stale/invalid pixels.
4. Compute cloud visualization only from validated scientific quantities
   (with a documented physically defensible transfer) and independent CLM
   agreement. If a valid cloud optical thickness is unavailable at night,
   keep the current WMS/NOAA visual backup with honest provenance.
5. Merge **only** where original GOES/JMA science has G=0. Keep source
   provenance, acquisition UTC and observed science coverage separate.
6. Run actual same-angle Africa and Antarctica day/night screenshots before
   any user-facing enablement; do not merge PR #8 without visual acceptance.

Official references:
- https://metis.eumetsat.int/cloud/
- https://masif.eumetsat.int/ossi/pgd/mtgi_0deg_fdss.html
- https://user.eumetsat.int/resources/user-guides/frequently-asked-questions-for-data-store
