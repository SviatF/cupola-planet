// Configure SITE_URL (or NEXT_PUBLIC_SITE_URL) when CUPOLA receives its
// production domain. Only absolute http(s) origins are accepted.
const DEFAULT_ORIGIN = "https://cupola.earth";
const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
export const SITE_ORIGIN = (() => {
  try {
    const url = new URL(configured || DEFAULT_ORIGIN);
    return ["https:", "http:"].includes(url.protocol) ? url.origin : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
})();
export const absoluteUrl = (path: string) => new URL(path, SITE_ORIGIN).toString();
