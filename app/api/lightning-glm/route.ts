import { NextResponse } from "next/server";
import { parseGLMFeed } from "@/lib/earth/glmFlashFeed";

export const revalidate = 0;
const BASE = "https://github.com/SviatF/cupola-planet/releases/download/cupola-glm-flashes-v1/";
const RELEASE_API = "https://api.github.com/repos/SviatF/cupola-planet/releases/tags/cupola-glm-flashes-v1";

function unavailable(reason: string) {
  return new NextResponse(null, { status: 204, headers: {
    "Cache-Control": "no-store",
    "X-Cupola-Data-Status": reason,
    "X-Cupola-Source": "NOAA GOES GLM-L2-LCFA",
  } });
}

async function fetchAndValidate(url: string) {
  try {
    const response = await fetch(url, {
      cache: "no-store", signal: AbortSignal.timeout(13000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 450_000) return null;
    return parseGLMFeed(JSON.parse(text));
  } catch { return null; }
}

// Immutable version recovery protects against GitHub release clobber CDN lag.
// Never serve an old or expired file as live flashes.
async function fromRelease() {
  try {
    const response = await fetch(RELEASE_API, {
      next: { revalidate: 45 },
      headers: { Accept: "application/vnd.github+json",
        "User-Agent": "CUPOLA-GLM-Observations" },
      signal: AbortSignal.timeout(9500),
    });
    if (!response.ok) return null;
    const listing = await response.json() as {
      assets?: Array<{name: string; browser_download_url: string}>;
    };
    const latest = (listing.assets || [])
      .filter(asset => /^flashes-\d{14}\.json$/.test(asset.name) &&
        asset.browser_download_url.startsWith(BASE))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 3);
    for (const item of latest) {
      const validated = await fetchAndValidate(item.browser_download_url);
      if (validated) return validated;
    }
  } catch { /* The source is optional; no fake events. */ }
  return null;
}

export async function GET() {
  const pointer = BASE + "latest.json?v=" + Math.floor(Date.now() / 30_000);
  const feed = await fetchAndValidate(pointer) || await fromRelease();
  if (!feed) return unavailable("no-fresh-qa-screened-glm-flashes");

  return NextResponse.json(feed, { headers: {
    "Cache-Control": "public, max-age=15, s-maxage=15",
    "X-Cupola-Data-Status": "goes-glm-observed-flash-centroids",
    "X-Cupola-Source": "NOAA GLM-L2-LCFA GOES-18/19",
    "X-Cupola-Quality": "flash_quality_flag=0;optical-centroid-not-ground-strike",
    "X-Cupola-Latest-Observed": feed.latest_observation_at,
    "X-Cupola-Publisher-Time": feed.generated_at,
  } });
}
