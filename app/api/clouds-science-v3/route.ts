import { NextRequest, NextResponse } from "next/server";

/**
 * Read ONLY validated rolling NOAA/JMA Level-2 scientific cloud atlases.
 * The GitHub Actions pipeline publishes versioned PNG + manifest assets,
 * not WMS IR screenshots. No EUMETSAT key or client-side GitHub token.
 */
export const dynamic = "force-dynamic";

const RELEASE = "https://api.github.com/repos/SviatF/cupola-planet/releases/tags/cupola-scientific-v3";
const ASSETS_PREFIX = "https://github.com/SviatF/cupola-planet/releases/download/cupola-scientific-v3/";
const VERSION = /^\d{14}$/;
const MAX_AGE_MS = 90 * 60_000;

type Asset = { name: string; browser_download_url: string; size: number };
type Release = { assets?: Asset[] };
type Observation = { source: string; product: string; observation_start: string; observation_end: string; time_precision: string };
type Manifest = {
  schema: string; version: string; generated_at: string; expires_at: string;
  width: number; height: number; atlas_file: string; atlas_sha256: string;
  observed_coverage_fraction: number; science_products: string[];
  sources: Observation[]; meteosat_api_used: boolean; not_a_static_fallback: boolean;
};

function absent(reason: string): NextResponse {
  return new NextResponse(null, { status: 204, headers: {
    "Cache-Control": "no-store", "X-Cupola-Data-Status": reason,
  } });
}

function assetUrl(asset: Asset, requiredName: string): string | null {
  if (asset.name !== requiredName || !Number.isFinite(asset.size) || asset.size < 100)
    return null;
  const exact = ASSETS_PREFIX + requiredName;
  return asset.browser_download_url === exact ? exact : null;
}

async function readRelease(): Promise<Asset[]> {
  const res = await fetch(RELEASE, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "CUPOLA-Scientific-V3" },
    next: { revalidate: 45 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json() as Release;
  return Array.isArray(data.assets) ? data.assets : [];
}

function newestVersion(assets: Asset[]): string | null {
  const versions = assets.flatMap((asset) => {
    const match = /^manifest-(\d{14})\.json$/.exec(asset.name);
    return match && assets.some((candidate) => candidate.name === "atlas-" + match[1] + ".png")
      ? [match[1]] : [];
  });
  return versions.sort().at(-1) ?? null;
}

async function readManifest(assets: Asset[], version: string): Promise<Manifest | null> {
  const entry = assets.find((asset) => asset.name === "manifest-" + version + ".json");
  if (!entry || entry.size > 40_000) return null;
  const url = assetUrl(entry, entry.name);
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const manifest = await res.json() as Manifest;
  if (manifest.schema !== "cupola-scientific-cloud-v3/v1" ||
      manifest.version !== version || manifest.width !== 2048 || manifest.height !== 1024 ||
      manifest.atlas_file !== "atlas-" + version + ".png" ||
      !/^[a-f0-9]{64}$/.test(manifest.atlas_sha256) ||
      manifest.meteosat_api_used !== false || manifest.not_a_static_fallback !== true ||
      !Number.isFinite(manifest.observed_coverage_fraction) ||
      manifest.observed_coverage_fraction < 0.05 || manifest.observed_coverage_fraction > 1 ||
      !Array.isArray(manifest.sources) || manifest.sources.length === 0 ||
      !Array.isArray(manifest.science_products) ||
      manifest.science_products.length === 0 ||
      manifest.science_products.some((name) => ![
        "goes-east-acmf", "goes-west-acmf", "himawari9-ahi-cmsk",
      ].includes(name))) return null;

  const now = Date.now();
  const generated = Date.parse(manifest.generated_at);
  const expires = Date.parse(manifest.expires_at);
  if (!Number.isFinite(generated) || !Number.isFinite(expires) ||
      generated > now + 5 * 60000 || expires <= now || expires > generated + MAX_AGE_MS + 5 * 60000)
    return null;
  for (const source of manifest.sources) {
    const start = Date.parse(source.observation_start);
    const end = Date.parse(source.observation_end);
    if (!Number.isFinite(start) || !Number.isFinite(end) ||
        start > end || end > now + 5 * 60000 ||
        now - start > MAX_AGE_MS || ![
          "goes-acmf", "himawari9-cmsk",
        ].includes(source.source)) return null;
  }
  return manifest;
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "manifest" && kind !== "atlas") {
    return NextResponse.json({ error: "Expected kind=manifest or kind=atlas" }, { status: 400 });
  }
  try {
    const assets = await readRelease();
    const version = kind === "manifest"
      ? newestVersion(assets)
      : request.nextUrl.searchParams.get("version");
    if (!version || !VERSION.test(version)) return absent("no-scientific-release");
    const manifest = await readManifest(assets, version);
    if (!manifest) return absent("no-fresh-verified-science-atlas");
    if (kind === "manifest") {
      return NextResponse.json(manifest, { headers: {
        "Cache-Control": "public, s-maxage=45, stale-while-revalidate=30",
        "X-Cupola-Data-Status": "scientific-observed",
      } });
    }
    const entry = assets.find((asset) => asset.name === manifest.atlas_file);
    if (!entry || entry.size > 12_000_000) return absent("atlas-asset-missing");
    const url = assetUrl(entry, manifest.atlas_file);
    if (!url) return absent("invalid-atlas-asset-url");
    const source = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!source.ok) return absent("atlas-download-failed");
    const bytes = await source.arrayBuffer();
    if (bytes.byteLength !== entry.size || bytes.byteLength < 1000 || bytes.byteLength > 12_000_000)
      return absent("atlas-length-mismatch");
    const png = new DataView(bytes);
    if (png.getUint32(0) !== 0x89504e47 || png.getUint32(4) !== 0x0d0a1a0a ||
        png.getUint32(16) !== 2048 || png.getUint32(20) !== 1024)
      return absent("atlas-invalid-png");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    if (digest !== manifest.atlas_sha256) return absent("atlas-hash-mismatch");
    return new NextResponse(bytes, { headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=90, s-maxage=90",
      "X-Cupola-Data-Status": "scientific-observed",
      "X-Cupola-Science-Products": manifest.science_products.join(","),
      "X-Cupola-Observation-Expires": manifest.expires_at,
    } });
  } catch {
    return absent("scientific-feed-temporarily-unavailable");
  }
}
