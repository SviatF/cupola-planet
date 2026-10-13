/**
 * Single, pure Cloud V3 presentation policy. All source precedence and
 * scientific provenance remain in their dedicated scientific modules.
 *
 * IMPORTANT: These defaults reproduce the last approved PR #8 cloud look:
 * grey-detail v2, 12px protective seams + 56px tone matching, bilateral
 * measured NOAA IR 64px, and an optional *classified* model gap fill.
 *
 * Query flags are explicit QA overrides only. They must never silently
 * become the production/default algorithm when removing preview controls.
 */
export type CloudV3RuntimeConfig = Readonly<{
  seamMode: "normal" | "wide" | "legacy";
  nativeIrCrossoverRadius: 64 | 96;
  useLimbOverlay: boolean;
  useGmgsi: boolean;
  useGreyDetail: boolean;
  useGlobalModel: boolean;
  useVisualGap: boolean;
  meteosatVisualMode: "clm" | "ir";
  exportAtlasPng: boolean;
}>;

export function resolveCloudV3RuntimeConfig(params: URLSearchParams): CloudV3RuntimeConfig {
  const rawSeamMode = params.get("cloudSeams");
  const seamMode = rawSeamMode === "wide" || rawSeamMode === "legacy"
    ? rawSeamMode : "normal";
  return {
    seamMode,
    nativeIrCrossoverRadius: params.get("cloudCrossover") === "right96" ? 96 : 64,
    useLimbOverlay: params.get("cloudLimb") !== "off",
    useGmgsi: params.get("cloudGmgsi") !== "none",
    useGreyDetail: params.get("cloudGrey") !== "legacy",
    useGlobalModel: params.get("cloudModel") !== "none",
    useVisualGap: params.get("cloudGap") !== "none",
    meteosatVisualMode: params.get("cloudMeteosat") === "ir" ? "ir" : "clm",
    // Encoding ~8 MB of atlas pixels to PNG every refresh is unnecessary
    // work on the UI thread. Only opt-in E2E/source auditors need this.
    exportAtlasPng: params.get("cloudAtlasExport") === "1" ||
      params.get("cloudAudit") === "sources",
  };
}
