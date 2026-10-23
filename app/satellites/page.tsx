import type { Metadata } from "next";
import Link from "next/link";
import { satellitePath, satelliteProfiles } from "@/lib/seo/satellites";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Satellite Tracker Atlas — ISS, NOAA, Hubble & More | CUPOLA",
  description: "Explore six spacecraft with verified NORAD identifiers, mission context, orbital explanations and direct links to CUPOLA's interactive 3D SGP4 tracker.",
  alternates: { canonical: "/satellites" },
  openGraph: {
    title: "Satellite Tracker Atlas | CUPOLA",
    description: "Find a real spacecraft and understand its modelled orbit before following it around Earth in 3D.",
    url: "/satellites",
    type: "website",
  },
};

export default function SatelliteAtlasPage() {
  const structured = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "CUPOLA Satellite Tracker Atlas",
    url: absoluteUrl("/satellites"),
    description: "A curated, educational satellite tracking directory.",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: satelliteProfiles.map((satellite, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: satellite.name,
        url: absoluteUrl(satellitePath(satellite)),
      })),
    },
  };
  return (
    <main className="seo-page">
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
      <header className="seo-nav">
        <Link className="seo-brand" href="/">CUPOLA<sup>°</sup></Link>
        <nav aria-label="Primary navigation">
          <Link href="/">LIVE EARTH</Link>
          <span aria-current="page">SATELLITE ATLAS</span>
        </nav>
      </header>
      <div className="seo-container">
        <div className="seo-eyebrow">CUPOLA / SPACE OBJECTS / CURATED ATLAS</div>
        <h1>Track satellites around Earth</h1>
        <p className="seo-lede">Explore actual spacecraft by mission and NORAD catalog number. Learn what their orbits mean, then open each object in CUPOLA's interactive 3D globe.</p>
        <div className="seo-statline"><span>6 mission profiles</span><span>SGP4 orbital predictions</span><span>Original mission sources</span></div>
        <section aria-labelledby="missions-heading">
          <h2 id="missions-heading">Choose a satellite</h2>
          <div className="seo-grid">
            {satelliteProfiles.map((satellite) => (
              <article className="seo-card" key={satellite.norad}>
                <div className="seo-card-top"><span>{satellite.tag}</span><span>NORAD {satellite.norad}</span></div>
                <h3><Link href={satellitePath(satellite)}>{satellite.name}</Link></h3>
                <p>{satellite.intro}</p>
                <div className="seo-card-foot"><span>{satellite.orbit}</span><Link href={satellitePath(satellite)}>Explore mission ↗</Link></div>
              </article>
            ))}
          </div>
        </section>
        <section className="seo-explainer" aria-labelledby="tracking-explainer">
          <h2 id="tracking-explainer">What does “live satellite tracking” mean?</h2>
          <p>CUPOLA computes estimated spacecraft positions from published orbital elements using SGP4. The displayed position can change with time even when the underlying element set was issued hours earlier. It is a prediction, not a direct telemetry connection to an individual spacecraft.</p>
          <p>An orbital ground track shows where a spacecraft passes over Earth's surface. It does not establish whether a satellite is visible in your sky, currently gathering imagery, or transmitting data. Each profile explains the distinction for that mission.</p>
          <p>Catalog availability and accuracy depend on upstream sources. If data is stale or unavailable, CUPOLA must label or reject the degraded result instead of implying that a position is confirmed.</p>
          <Link className="seo-primary-cta" href="/">Open interactive Earth →</Link>
        </section>
        <footer className="seo-footer">CUPOLA° · Orbital positions are predictions, not spacecraft telemetry. <Link href="/">Explore Earth</Link></footer>
      </div>
    </main>
  );
}
