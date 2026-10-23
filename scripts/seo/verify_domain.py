#!/usr/bin/env python3
"""Production-only crawlability test. Never assumes a successful deploy means indexation."""
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ORIGIN = "https://cupola.earth"
EXPECTED = {
    "/",
    "/satellites",
    "/satellites/iss-25544",
    "/satellites/hubble-20580",
    "/satellites/noaa-20-43013",
    "/satellites/noaa-21-54234",
    "/satellites/landsat-9-49260",
    "/satellites/goes-18-51850",
}


def fetch(path):
    url = ORIGIN + path
    last_error = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "CUPOLA-Domain-SEO-Smoke/1.0 (+https://cupola.earth)",
                "Accept": "text/html,application/xml,text/plain",
                "Cache-Control": "no-cache",
            })
            with urllib.request.urlopen(req, timeout=18) as resp:
                if resp.status != 200:
                    raise AssertionError(f"{path} HTTP {resp.status}")
                if urllib.parse.urlparse(resp.url).netloc != "cupola.earth":
                    raise AssertionError(f"{path} redirected off canonical host to {resp.url}")
                raw = resp.read(2_500_001)
                if len(raw) >= 2_500_001:
                    raise AssertionError(f"{path} unexpectedly large response")
                return raw.decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, AssertionError) as exc:
            last_error = exc
            print(f"{path}: attempt {attempt+1}/5: {exc}", flush=True)
            if attempt < 4:
                time.sleep(10)
    raise AssertionError(f"Public SEO endpoint unavailable: {path}: {last_error}")


def main():
    import urllib.parse
    globals()["urllib"].parse = urllib.parse
    home = fetch("/")
    atlas = fetch("/satellites")
    iss = fetch("/satellites/iss-25544")
    robots = fetch("/robots.txt")
    sitemap = fetch("/sitemap.xml")

    for path, html in (("/", home), ("/satellites", atlas),
                       ("/satellites/iss-25544", iss)):
        if "<title" not in html.lower() or "<h1" not in html.lower():
            raise AssertionError(f"{path} missing SSR title/H1")
        if re.search(r'<meta[^>]+name=["\']robots["\'][^>]+noindex', html, re.I):
            raise AssertionError(f"{path} unexpectedly noindex")
        if not re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']'
                         + re.escape(ORIGIN + path) + r'["\']', html, re.I):
            raise AssertionError(f"{path} has missing/noncanonical link")
    if "/satellites/iss-25544" not in atlas:
        raise AssertionError("Atlas lacks crawlable internal mission anchors")
    if "International Space Station" not in iss:
        raise AssertionError("ISS profile not present in server-rendered HTML")

    low_robots = robots.lower()
    if "sitemap: https://cupola.earth/sitemap.xml" not in low_robots:
        raise AssertionError("robots.txt missing cupola.earth sitemap")
    if "disallow: /api/" not in low_robots:
        raise AssertionError("robots.txt missing API exclusion")
    if "disallow: /satellites" in low_robots:
        raise AssertionError("robots.txt excludes the catalog")

    document = ET.fromstring(sitemap)
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [node.text for node in document.findall("s:url/s:loc", ns)]
    expected = {ORIGIN + path for path in EXPECTED}
    if set(urls) != expected or len(urls) != 8:
        raise AssertionError(f"Sitemap mismatch: expected {sorted(expected)}, got {urls}")
    if any("workers.dev" in url or "/api/" in url for url in urls):
        raise AssertionError("Sitemap contains Worker alias or API URL")

    print("PASS: public HTTPS + canonical host, crawlable SSR, robots, exactly 8 sitemap URLs",
          flush=True)
    print("NOTICE: Indexing in Google requires separate Search Console verification.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
