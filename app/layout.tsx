import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_ORIGIN } from "@/lib/seo/site";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: "CUPOLA° — Earth. Right Now.", template: "%s" },
  description: "Explore Earth's real satellite data, science-led weather imagery, space events and astronomical models on an interactive 3D globe.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title: "CUPOLA° — Earth. Right Now.",
    description: "A cinematic 3D view of Earth, its satellites and the sky, informed by science and real observations.",
    url: "/",
    siteName: "CUPOLA°",
    locale: "en_US",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable + " " + mono.variable}>{children}</body>
    </html>
  );
}
