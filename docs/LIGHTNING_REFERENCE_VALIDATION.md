# CUPOLA Lightning: independent reference and validation protocol

## The two maps do **not** measure the same thing

| Feature | CUPOLA | LightningMaps / Blitzortung |
| --- | --- | --- |
| Observation | NOAA nowCOAST `ldn_lightning_strike_density`: 15-minute accumulated, gridded strike density; EUMETSAT MTG LI `mtg_fd:li_afa`: 5-minute accumulated optical flash-area product | Individual radio-detected lightning discharges located by participating community stations using time-of-arrival |
| Time display | NOAA observation accepted up to 45 min old; MTG up to 30 min; both checked from their own layer's UTC timestamp | Live map can show strikes up to two hours old depending on selected setting; check the age legend before drawing conclusions |
| On-screen locations | Up to 36 activity regions selected for cinematic animation, not every pixel or discharge | Many individual detections; not an exhaustive ground truth everywhere |
| Extra coverage | ECMWF/Open-Meteo lightning-density **MODEL** estimates are always labeled separately | Blitzortung station network footprint, which differs from satellite/derived detection coverage |
| Animated shape and timing | Procedural illustrations of plausible electrical discharges **within observed or modeled regions** | Observed strike points; not the same visualization |

**Do not equate the number of CUPOLA animated bolts with actual strike counts.** The presence/absence of a rendered animation is not an official severe-storm warning.

### Independent manual comparison

1. Open CUPOLA and the [LightningMaps real-time map](https://www.lightningmaps.org/?lang=uk#m=ses;t=3;s=0;o=0;b=;ts=0;) in separate tabs.
2. Select the **most recent 0–20-minute age range** at LightningMaps (older colored strikes up to 120 minutes are not comparable to a 15-minute NOAA accumulation).
3. Capture the **UTC time** of both views. NOAA observations are 15-minute accumulations and published with latency, so a strict minute-by-minute match is **not expected**. EUMETSAT LI-AFA is an optical flash-area product over a different footprint, not ground network strokes.
4. Compare named regions (e.g. Southern Plains, Midwest, Caribbean, Central Mediterranean) and record only whether both sources indicate lightning activity there. Avoid direct count equality.
5. Check GitHub Actions **Lightning Source Availability Probe** for per-source `observation_utc`, `cupola_usable_now` and `regional_signal_pixels`; these are PNG activity pixels, not strikes. They confirm that the backend had a usable nonblank frame, not that all active regions were retained in the client.
6. If LightningMaps shows activity but CUPOLA does not, distinguish: (a) different lookback windows, (b) network sensor coverage/detection thresholds, (c) stale/unavailable WMS, (d) region classification/downsampling, (e) capped/occluded animation zones and flash duty cycle, and (f) whether the CUPOLA observation or forecast layer was used.

### Data access and rights

Blitzortung's own [documentation](https://docs.lightningmaps.org/) states that commercial reuse is prohibited. Network moderators further clarify that raw/live strike streams are **not a public data API for third-party apps**. CUPOLA links to their public map **only for user-initiated independent verification**. We do **not** access its private/undocumented WebSocket endpoints, scrape its markers, proxy its feed or present its strike data as CUPOLA observations. Any future directly integrated strike stream requires a separately licensed provider or an explicit written authorization.

### Current backend sources

- NOAA density endpoint: `/api/lightning`; WMS layer `ldn_lightning_strike_density`; `X-Cupola-Window: 15m`, `X-Cupola-Max-Age-Minutes: 45`.
- MTG flash-area endpoint: `/api/lightning-eumetsat`; WMS layer `mtg_fd:li_afa`; `X-Cupola-Window: 5m`, `X-Cupola-Max-Age-Minutes: 30`.
- Forecast fallback: `/api/lightning-model`; ECMWF/Open-Meteo grid; not an observed strike network.

**Future improvement:** implement a licensed individual-strike feed, with explicit per-stroke event UTC, geocoordinates, geographic coverage and usage rights. Until that exists, refer to the CUPOLA effect as a **cinematic illustration of observed lightning-active regions**, not as synchronized real strikes.
