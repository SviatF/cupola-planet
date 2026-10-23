import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";
import { satellitePath, satelliteProfiles } from "@/lib/seo/satellites";
import {approvedDailyReports,dailyReportPath} from "@/lib/editorial/publishedDaily";

// Curated indexable URLs only. Never add API, temporary event, laboratory,
// or unreviewed dynamically generated satellite pages to the sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/") },
    { url: absoluteUrl("/satellites") },
    ...satelliteProfiles.map((profile) => ({ url: absoluteUrl(satellitePath(profile)) })),
    // Only explicit human-approved, provenance-complete day reports.
    // The registry is initially empty, so the live sitemap remains eight URLs.
    ...approvedDailyReports.map(report=>({url:absoluteUrl(dailyReportPath(report.day)),
      lastModified:new Date(report.approvedBy.updatedAt||report.approvedBy.publishedAt)})),
  ];
}
