# CUPOLA — domain and indexation release gate

Primary brand origin: https://cupola.earth (apex, no www). The SEO code already uses this canonical origin.

## Infrastructure (pending Cloudflare zone activation)

1. At the registrar, point domain nameservers to those provided by the Cloudflare zone for cupola.earth. Confirm zone status Active.
2. In Cloudflare: Workers & Pages → cupola-planet → Settings → Domains & Routes → Add → Custom Domain → cupola.earth. Cloudflare creates its DNS record and TLS certificate automatically. Avoid competing apex CNAME records.
3. Optionally attach www.cupola.earth and redirect it to the apex with HTTP 301/308.
4. Validate HTTPS and HTTP 200 at /, /satellites, /satellites/iss-25544, /robots.txt and /sitemap.xml.
5. The SITE_URL / NEXT_PUBLIC_SITE_URL configuration defaults to https://cupola.earth. Do not enable the www or workers.dev redirect while the apex cannot resolve.

Cloudflare reference: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

## SEO validation

- Robots allows intended paths and disallows API and Eclipse Lab. Sitemap lists exactly eight curated indexable URLs (home, catalog, six profiles).
- Inspect RAW HTML output for title, canonical, description, H1, unique mission text and crawlable internal anchors without enabling JavaScript/WebGL.
- Verify cupola.earth in Search Console using DNS TXT verification; submit https://cupola.earth/sitemap.xml only AFTER the domain is responding.
- Use URL Inspection on the homepage, satellite catalog and ISS profile. Track discovered, crawled, indexed, impressions and Google-selected canonical. Sitemap submission does not guarantee indexing.
- Keep satellite expansion behind unique-source and content QA; do not mass-index thin automated profiles.
- GSC Wizard plugin trial is currently inaccessible; use native Search Console or reconnect a supported integration when ready.

## Production quality gates

- Satellite API: verified SHA-256 catalog, per-orbit epoch checks and graceful behavior during CelesTrak 403 outages (PR #125).
- Client: real browser checks for Earth Intelligence, Cinema > Explore, Moon controls, responsive viewports and interaction with satellite objects (PR #126).
- Earth DATA: differentiate observed NOAA/JMA cloud footprints, NOAA GFS weather model, historical NASA day/night base, daily VIIRS pixels, forecast OVATION aurora and synthetic effects.
- FPS measured on a hardware GPU, not GitHub SwiftShader. Check desktop and mobile navigation, texture seams and Moon phase.
- 24H HISTORY displays timestamped currently loaded events only; it is not a verified cloud-video rewind. A true cloud timeline requires an archival frame publishing and retention pipeline.

Never treat a successful build as evidence that the domain is attached or Google has indexed the site.
