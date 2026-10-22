import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";
import { satellitePath, satelliteProfiles } from "@/lib/seo/satellites";

// Curated indexable URLs only. Never add API, temporary event, laboratory,
// or unreviewed dynamically generated satellite pages to the sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/") },
    { url: absoluteUrl("/satellites") },
    ...satelliteProfiles.map((profile) => ({ url: absoluteUrl(satellitePath(profile)) })),
  ];
}
