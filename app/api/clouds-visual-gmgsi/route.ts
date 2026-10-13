import { NextRequest, NextResponse } from "next/server";

/**
 * Isolated NOAA GMGSI georeferenced LW-IR VISUAL preview.
 * Not a native Level-2 cloud-mask product or optical depth measurement.
 * Signed-off only after the publisher has validated native DQF/geolocation.
 * The source's G/B provenance bytes are retained by the V3 compositor.
 */
export const dynamic = "force-dynamic";
const BASE = "https://github.com/SviatF/cupola-planet/releases/download/cupola-gmgsi-visual-preview/";
const VERSION = /^\d{14}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const MAX_AGE_MS = 4 * 60 * 60_000;
// Only for explicitly-labelled NON-LIVE display continuity while publisher
// schedules cannot run on a pull-request branch. Never classified as live.
const VISUAL_ARCHIVE_MAX_AGE_MS = 48 * 60 * 60_000;

type Manifest = {
  schema: string; version: string; generated_at: string;
  observation_start: string; expires_at: string; atlas_file: string;
  atlas_sha256: string; width: number; height: number;
  source_grid_fraction: number; source_area_fraction: number;
  cloud_optical_depth_calibrated: boolean;
  native_noaa_jma_level2_cloudmask: boolean;
  native_dqf_zero_screen_used: boolean;
  used_as_visual_only: boolean; source: string;
  grey_detail_available?: boolean;
  grey_detail_file?: string;
  grey_detail_sha256?: string;
  grey_detail_transfer?: string;
  grey_detail_visual_only?: boolean;
};

const unavailable = (reason: string) => new NextResponse(null, {
  status: 204, headers: {
    "Cache-Control": "no-store", "X-Cupola-Data-Status": reason,
  },
});

function valid(m: Manifest, version?: string, archive = false): boolean {
  const now = Date.now();
  const observed = Date.parse(m?.observation_start);
  const generated = Date.parse(m?.generated_at);
  const expires = Date.parse(m?.expires_at);
  return !!m && m.schema === "cupola-gmgsi-ir-visual/v1" &&
    VERSION.test(m.version) && (!version || m.version === version) &&
    m.atlas_file === "gmgsi-visual-" + m.version + ".png" &&
    DIGEST.test(m.atlas_sha256) && m.width === 2048 && m.height === 1024 &&
    m.source_grid_fraction > 0.50 && m.source_grid_fraction <= 1 &&
    m.source_area_fraction > 0.80 && m.source_area_fraction <= 1 &&
    m.cloud_optical_depth_calibrated === false &&
    m.native_noaa_jma_level2_cloudmask === false &&
    m.native_dqf_zero_screen_used === true &&
    m.used_as_visual_only === true &&
    m.source === "NOAA GMGSI LW multisatellite infrared mosaic" &&
    // Existing manifest stays valid while the new optional publisher rolls
    // out, but a declared detail texture must be SHA-checked and identified.
    (!m.grey_detail_available || (
      m.grey_detail_file === "gmgsi-grey-detail-" + m.version + ".png" &&
      typeof m.grey_detail_sha256 === "string" &&
      DIGEST.test(m.grey_detail_sha256) &&
      ["structured-local-noaa-lw-v1", "structured-local-noaa-lw-v2"].includes(m.grey_detail_transfer || "") &&
      m.grey_detail_visual_only === true
    )) &&
    [observed,generated,expires].every(Number.isFinite) &&
    observed <= generated && generated <= now + 300_000 &&
    observed <= now + 300_000 &&
    observed >= now - (archive ? VISUAL_ARCHIVE_MAX_AGE_MS : MAX_AGE_MS) &&
    (archive || expires > now) &&
    expires <= observed + MAX_AGE_MS + 60_000 && expires > observed;
}

type ReleaseAsset = {
  name: string; size: number; state: string; url: string;
  browser_download_url: string;
};
const RELEASE_API =
  "https://api.github.com/repos/SviatF/cupola-planet/releases/tags/cupola-gmgsi-visual-preview";
const RELEASE_ASSET_API =
  "https://api.github.com/repos/SviatF/cupola-planet/releases/assets/";

async function releaseAssets(): Promise<ReleaseAsset[]> {
  try {
    const res = await fetch(RELEASE_API, {
      headers: { Accept: "application/vnd.github+json",
        "User-Agent": "CUPOLA-Visual-Archive-Recovery" },
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(9_000),
    });
    if (!res.ok) return [];
    const obj = await res.json() as { assets?: ReleaseAsset[] };
    if (!Array.isArray(obj.assets)) return [];
    return obj.assets.filter(item =>
      item.state === "uploaded" &&
      Number.isFinite(item.size) && item.size >= 200 &&
      item.size < 8_000_000 &&
      item.browser_download_url === BASE + item.name &&
      item.url.startsWith(RELEASE_ASSET_API) &&
      /^\\d+$/.test(item.url.slice(RELEASE_ASSET_API.length)));
  } catch {
    return [];
  }
}

// GitHub release assets are clobbered atomically by the publisher. During
// the short CDN/302 propagation interval even 'latest.json?v=...' can 404,
// despite verified immutable versioned assets being present in Release REST.
// Resolve a versioned manifest from the GitHub API instead of silently
// declaring that the entire 80.9%-coverage NOAA IR satellite has vanished.
async function fetchReleaseBytes(
  filename: string, asset?: ReleaseAsset,
): Promise<ArrayBuffer | null> {
  const candidates = [
    { url: BASE + filename, headers: {} as Record<string,string> },
    ...(asset ? [{ url: asset.url,
      headers: { "Accept": "application/octet-stream",
        "User-Agent": "CUPOLA-Visual-Archive-Recovery" } }] : []),
  ];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        headers: candidate.headers, cache:"no-store",
        signal:AbortSignal.timeout(16_000),
      });
      if (!response.ok) continue;
      const length = Number(response.headers.get("content-length") || "0");
      if (length > 8_000_000) continue;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 200 || bytes.byteLength > 8_000_000) continue;
      return bytes;
    } catch {
      // Only the next verified same-filename GitHub asset is tried.
    }
  }
  return null;
}
async function fetchManifest(version:string|null,archive=false):Promise<Manifest|null>{
  if(version && !VERSION.test(version))return null;
  const pointerName=version?"manifest-"+version+".json":"latest.json";
  const tryDecode=(bytes:ArrayBuffer|null,expected?:string)=>{
    if(!bytes || bytes.byteLength<200 || bytes.byteLength>15_000)return null;
    try {
      const source=new TextDecoder().decode(bytes);
      const m=JSON.parse(source) as Manifest;
      return valid(m,expected,archive)?m:null;
    } catch {return null;}
  };
  // Fast path stays unchanged when the publisher's atomic pointer is healthy.
  const query=version?"":"?v="+Math.floor(Date.now()/60_000);
  const fast=await fetchReleaseBytes(pointerName+(query?"":"" ));
  // The versioned file has no query; latest needs a cache-busting key but
  // fetchReleaseBytes intentionally validates the exact basename. Retry it
  // with the query only when the plain pointer was unusable.
  let direct=tryDecode(fast,version??undefined);
  if(direct)return direct;

  const assets=await releaseAssets();
  const manifestVersions=version?[version]:
    assets.flatMap(item=>{
      const m=/^manifest-(\\d{14})\\.json$/.exec(item.name);
      return m&&assets.some(x=>x.name==="gmgsi-visual-"+m[1]+".png")
        ? [m[1]]:[];
    }).sort().reverse().slice(0,3);
  for(const v of manifestVersions){
    const name="manifest-"+v+".json";
    const asset=assets.find(item=>item.name===name);
    if(!asset)continue;
    const candidate=tryDecode(await fetchReleaseBytes(name,asset),v);
    if(candidate)return candidate;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  const style = request.nextUrl.searchParams.get("style") ?? "detail";
  if (style !== "legacy" && style !== "detail")
    return NextResponse.json({error:"Expected style=legacy or detail"},{status:400});
  const archive = kind === "archive-manifest" || kind === "archive-atlas";
  const isAtlas = kind === "atlas" || kind === "archive-atlas";
  if (kind !== "manifest" && kind !== "atlas" && !archive)
    return NextResponse.json({error:"Expected manifest, atlas, archive-manifest or archive-atlas"},{status:400});
  const version = isAtlas ? request.nextUrl.searchParams.get("version") : null;
  if (isAtlas && (!version || !VERSION.test(version)))
    return unavailable("invalid-gmgsi-version");
  const manifest = await fetchManifest(version, archive);
  if (!manifest) return unavailable(archive
    ? "no-sha-verified-archived-gmgsi-visual" : "no-fresh-validated-gmgsi-ir");
  if (!isAtlas)
    return NextResponse.json(manifest, {headers:{
      "Cache-Control":"no-store",
      "X-Cupola-Data-Status":archive
        ? "archived-ir-visual-not-live" : "satellite-ir-visual-not-cloudmask",
      "X-Cupola-Visual-Archive":archive ? "true" : "false",
      "X-Cupola-Observation-Time":manifest.observation_start,
    }});
  try {
    const detailed = style === "detail" && manifest.grey_detail_available === true &&
      manifest.grey_detail_transfer === "structured-local-noaa-lw-v2";
    // No silent promotion to fabricated OCA/Level-2: both modes are NOAA
    // visual IR, with exactly the same DQF mask and source provenance.
    // If a publisher release has not completed yet, serve legacy safely.
    const assetFile = detailed ? manifest.grey_detail_file! : manifest.atlas_file;
    const expectedSha = detailed ? manifest.grey_detail_sha256! : manifest.atlas_sha256;
    let bytes = await fetchReleaseBytes(assetFile);
    if (!bytes) {
      const release = await releaseAssets();
      const exact = release.find(x => x.name === assetFile);
      if (exact) bytes = await fetchReleaseBytes(assetFile, exact);
    }
    if (!bytes) return unavailable("gmgsi-visual-download-failed");
    if (bytes.byteLength < 1000 || bytes.byteLength > 8_000_000)
      return unavailable("gmgsi-visual-invalid-size");
    const png = new DataView(bytes);
    if (png.getUint32(0) !== 0x89504e47 || png.getUint32(4) !== 0x0d0a1a0a ||
        png.getUint32(16) !== 2048 || png.getUint32(20) !== 1024)
      return unavailable("gmgsi-visual-invalid-png");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map(v => v.toString(16).padStart(2, "0")).join("");
    if (digest !== expectedSha)
      return unavailable("gmgsi-visual-sha256-mismatch");
    return new NextResponse(bytes,{headers:{
      "Content-Type":"image/png","Cache-Control":"public, max-age=60, s-maxage=60",
      "X-Cupola-Data-Status":archive
        ? "archived-ir-visual-not-live" : "satellite-ir-visual-not-cloudmask",
      "X-Cupola-Visual-Archive":archive ? "true" : "false",
      "X-Cupola-Observation-Time":manifest.observation_start,
      "X-Cupola-Source":"NOAA-GMGSI-IR",
      "X-Cupola-Verified-Cloudmask":"false",
      "X-Cupola-Visual-Style":detailed ? "detail" : "legacy",
      "X-Cupola-Grey-Detail-Available":manifest.grey_detail_available ? "true" : "false",
    }});
  } catch {
    return unavailable("gmgsi-visual-temporarily-unavailable");
  }
}
