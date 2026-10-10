import { NextRequest, NextResponse } from "next/server";

/**
 * Optional NO-KEY global NOAA GFS cloud COVER grid. This is an NWP model,
 * NEVER satellite imagery / Level-2 observation. Validity is independently
 * checked; SHA-256 is verified before a model PNG can reach WebGL.
 */
export const dynamic = "force-dynamic";
const RELEASE = "https://github.com/SviatF/cupola-planet/releases/download/cupola-scientific-v3/";
const VERSION = /^\d{14}$/;
const SHA = /^[a-f0-9]{64}$/;

type GfsManifest = {
  schema: string; version: string;
  model: string; variable: string;
  generated_at: string; model_run_at: string; valid_at: string; expires_at: string;
  grid_coverage_fraction: number;
  noaa_goes_l2_coverage_contribution: number;
  is_satellite_observation: boolean;
  width: number; height: number;
  atlas_file: string; atlas_sha256: string;
};

function unavailable(reason: string) {
  return new NextResponse(null, { status: 204, headers: {
    "Cache-Control": "no-store", "X-Cupola-Data-Status": reason,
  } });
}

function validate(meta: GfsManifest): boolean {
  if (!meta || meta.schema !== "cupola-global-gfs-model-v1" ||
      !VERSION.test(meta.version) ||
      meta.atlas_file !== "gfs-cloud-cover-" + meta.version + ".png" ||
      !SHA.test(meta.atlas_sha256) ||
      meta.variable !== "TCDC:entire atmosphere" ||
      meta.model !== "NOAA NCEP GFS 0.25 degree" ||
      meta.grid_coverage_fraction !== 1.0 ||
      meta.noaa_goes_l2_coverage_contribution !== 0 ||
      meta.is_satellite_observation !== false ||
      meta.width !== 2048 || meta.height !== 1024) return false;
  const time = [meta.generated_at, meta.model_run_at, meta.valid_at, meta.expires_at]
    .map(t => Date.parse(t));
  const [generated, run, valid, expires] = time;
  const now = Date.now();
  if (time.some(t => !Number.isFinite(t)) ||
      run !== valid || run > generated || generated > now + 5 * 60000 ||
      expires - run !== 12 * 3600_000 ||
      expires <= now || run > now + 5 * 60000 ||
      run < now - 12 * 3600_000) return false;
  return true;
}

async function currentModel(): Promise<GfsManifest | null> {
  try {
    const url = RELEASE + "gfs-latest.json?v=" + Math.floor(Date.now() / 60000);
    const response = await fetch(url, {
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (response.status !== 200) return null;
    const body = await response.text();
    if (body.length > 25_000) return null;
    const obj = JSON.parse(body) as GfsManifest;
    return validate(obj) ? obj : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "manifest" && kind !== "atlas") {
    return NextResponse.json({error: "Expected kind=manifest or kind=atlas"}, {status:400});
  }
  const meta = await currentModel();
  if (!meta) return unavailable("global-gfs-model-missing-or-expired");
  if (kind === "manifest") {
    return NextResponse.json(meta, { headers: {
      "Cache-Control": "no-store",
      "X-Cupola-Data-Status": "model-analysis-not-satellite",
    } });
  }
  if (req.nextUrl.searchParams.get("version") !== meta.version)
    return unavailable("model-version-changed");
  try {
    const response = await fetch(RELEASE + meta.atlas_file, {
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200) return unavailable("global-model-download-failed");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 1000 || bytes.byteLength > 8_000_000) return unavailable("global-model-image-size");
    const png = new DataView(bytes);
    if (png.getUint32(0) !== 0x89504e47 || png.getUint32(4) !== 0x0d0a1a0a ||
        png.getUint32(16) !== 2048 || png.getUint32(20) !== 1024)
      return unavailable("global-model-invalid-png");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map(v => v.toString(16).padStart(2, "0")).join("");
    if (digest !== meta.atlas_sha256) return unavailable("global-model-hash-mismatch");
    return new NextResponse(bytes, {headers: {
      "Content-Type": "image/png", "Cache-Control": "public, max-age=60, s-maxage=60",
      "X-Cupola-Data-Status": "model-analysis-not-satellite",
      "X-Cupola-Model-Valid-At": meta.valid_at,
      "X-Cupola-Model-Expires": meta.expires_at,
    }});
  } catch {
    return unavailable("global-model-upstream-error");
  }
}
