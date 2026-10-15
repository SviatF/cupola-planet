# CUPOLA 3.6 — observed sky image source and attribution

## Map, provenance, projection

- **Instrument/data:** ESA Gaia Early Data Release 3 (Gaia EDR3), published 3 December 2020. The colour-density sky image is assembled from measurements of more than 1.8 billion stars.
- **Source image (actual download):** [ESA interactive sky map](https://www.esa.int/var/esa/storage/images/esa_multimedia/images/2020/12/interactive_map_of_the_sky_from_gaia_s_early_data_release_3/25364650-1-eng-GB/Interactive_map_of_the_sky_from_Gaia_s_Early_Data_Release_3.png).
- **ESA original information:** https://www.esa.int/ESA_Multimedia/Images/2020/12/The_colour_of_the_sky_from_Gaia_s_Early_Data_Release_32
- **Projection:** Galactic equirectangular (2000 × 1000). **Do not substitute the Hammer/Aitoff map**; that projection cannot be directly UV-mapped onto a sphere.
- **Image download SHA-256:** `a831d1a88ce6df8406f498c2f6a30d3905138f8a6262e870903133c75339f4b9`.
- **Local distributed derivative:** `public/sky/gaia-edr3-equirect.webp`, 2000 × 1000 pixels; 500,816 bytes.
- **Modification:** Original ESA PNG converted to an optimized lossy WebP with Pillow, quality 86. No replacement of scientifically observed stellar distributions with generated visual noise.
- **WebGL:** an inside-out sky sphere converts scene directions into actual Galactic longitude and latitude with published north Galactic pole and Galactic centre J2000 coordinates. Its texture is independently depth-tested against the Earth sphere.
- **Foreground stars:** currently 5200 *stylized illustrative points*, not an independently verified astrometric catalogue. They are not represented as observed Gaia positions.

## Copyright / licensing

**Image credit: ESA/Gaia/DPAC; acknowledgement: A. Moitinho.**

Original and adapted image are offered under **CC BY-SA 3.0 IGO**, subject to attribution and share-alike conditions:

https://creativecommons.org/licenses/by-sa/3.0/igo/

The compressed and converted sky map is an **adaptation**, made by CUPOLA from the original colour density image. This adaptation is distributed under the same CC BY-SA 3.0 IGO terms. This licensing applies to the adapted *image*; it does not represent the site's entire codebase as ESA material. Do not imply endorsement by ESA. Provide the attribution and license URL within the Control Center.

## Implementation safeguards

- One image download from first-party static assets and one existing WebGL canvas; no network dependency on ESA during a user visit.
- No new WebGL renderer, CPU-heavy procedural dust rendering, or extra heavyweight astronomy libraries.
- Browser loading failures show the existing procedural sky fallback; Earth, satellites and clouds continue working.
- `depthTest=true` and `depthWrite=false` preserve 3D occlusion, avoiding transparent sky through Earth.
- Any later replacement map must preserve Galactic equirectangular alignment or explicitly adjust the UV transformation.
