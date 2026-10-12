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

function valid(m: Manifest, version?: string): boolean {
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
    observed <= now + 300_000 && observed >= now - MAX_AGE_MS &&
    expires > now && expires <= observed + MAX_AGE_MS + 60_000;
}

async function fetchManifest(version: string | null): Promise<Manifest | null> {
  if (version && !VERSION.test(version)) return null;
  // Version-pin atlas retrieval; never silently switch snapshots mid-frame.
  const url = BASE + (version ? "manifest-" + version + ".json" :
    "latest.json?v=" + Math.floor(Date.now() / 60_000));
  try {
    const response = await fetch(url, {
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length < 200 || body.length > 15_000) return null;
    const data = JSON.parse(body) as Manifest;
    return valid(data, version ?? undefined) ? data : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  const style = request.nextUrl.searchParams.get("style") ?? "detail";
  if (style !== "legacy" && style !== "detail")
    return NextResponse.json({error:"Expected style=legacy or detail"},{status:400});
  if (kind !== "manifest" && kind !== "atlas")
    return NextResponse.json({error:"Expected kind=manifest or kind=atlas"}, {status:400});
  const version = kind === "atlas" ? request.nextUrl.searchParams.get("version") : null;
  if (kind === "atlas" && (!version || !VERSION.test(version)))
    return unavailable("invalid-gmgsi-version");
  const manifest = await fetchManifest(version);
  if (!manifest) return unavailable("no-fresh-validated-gmgsi-ir");
  if (kind === "manifest")
    return NextResponse.json(manifest, {headers:{
      "Cache-Control":"no-store",
      "X-Cupola-Data-Status":"satellite-ir-visual-not-cloudmask",
    }});
  try {
    const detailed = style === "detail" && manifest.grey_detail_available === true &&
      manifest.grey_detail_transfer === "structured-local-noaa-lw-v2";
    // No silent promotion to fabricated OCA/Level-2: both modes are NOAA
    // visual IR, with exactly the same DQF mask and source provenance.
    // If a publisher release has not completed yet, serve legacy safely.
    const assetFile = detailed ? manifest.grey_detail_file! : manifest.atlas_file;
    const expectedSha = detailed ? manifest.grey_detail_sha256! : manifest.atlas_sha256;
    const response = await fetch(BASE + assetFile, {
      cache: "no-store", signal: AbortSignal.timeout(17_000),
    });
    if (!response.ok) return unavailable("gmgsi-visual-download-failed");
    const bytes = await response.arrayBuffer();
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
      "X-Cupola-Data-Status":"satellite-ir-visual-not-cloudmask",
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
