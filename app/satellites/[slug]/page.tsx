import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { satelliteBySlug, satellitePath, satelliteProfiles } from "@/lib/seo/satellites";
import { absoluteUrl } from "@/lib/seo/site";
import SatellitePositionReadout from "@/components/SatellitePositionReadout";
import {EditorialHeader,EditorialFooter} from "@/components/editorial/EditorialShell";
import {SceneVisual} from "@/components/editorial/SceneFrame";

type ProfileParams = { params: Promise<{ slug: string }> };
export const dynamicParams = false;

export function generateStaticParams() {
  return satelliteProfiles.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ProfileParams): Promise<Metadata> {
  const { slug } = await params;
  const profile = satelliteBySlug(slug);
  if (!profile) return { title: "Satellite not found | CUPOLA", robots: { index: false } };
  const description = "Track " + profile.name + " (NORAD " + profile.norad +
    ") in 3D. Mission details, " + profile.orbit.toLowerCase() +
    ", source context and SGP4 position caveats.";
  return {
    title: profile.name + " — 3D Satellite Tracker | CUPOLA",
    description,
    alternates: { canonical: satellitePath(profile) },
    openGraph: {
      title: profile.name + " | CUPOLA Satellite Atlas",
      description,
      url: satellitePath(profile),
      type: "article",
    },
  };
}

export default async function SatelliteProfilePage({ params }: ProfileParams) {
  const { slug } = await params;
  const profile = satelliteBySlug(slug);
  if (!profile) notFound();
  const otherSatellites = satelliteProfiles.filter((satellite) => satellite.norad !== profile.norad).slice(0, 3);
  const structured = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "CUPOLA Earth", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Satellites", item: absoluteUrl("/satellites") },
      { "@type": "ListItem", position: 3, name: profile.name, item: absoluteUrl(satellitePath(profile)) },
    ],
  };
  return (
    <div className="atlas-site"><EditorialHeader/><main className="seo-page">
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
      <header className="seo-nav">
        <Link className="seo-brand" href="/">CUPOLA<sup>°</sup></Link>
        <nav aria-label="Primary navigation"><Link href="/">LIVE EARTH</Link><Link href="/satellites">SATELLITE ATLAS</Link></nav>
      </header>
      <div className="seo-container">
        <nav className="seo-breadcrumb" aria-label="Breadcrumb"><Link href="/">Earth</Link> / <Link href="/satellites">Satellite Atlas</Link> / <span aria-current="page">{profile.name}</span></nav>
        <div className="seo-eyebrow">{profile.tag} / NORAD {profile.norad}</div>
        <h1>{profile.name} satellite tracker</h1>
        <p className="seo-lede">{profile.intro}</p>
        <SceneVisual id={"satellite-"+profile.norad} variant="wide" label="CUPOLA ORIGINAL SCENE / PENDING APPROVAL"/>
        <div className="seo-profile-meta">
          <div><span>CATALOG ID</span><strong>{profile.norad}</strong></div>
          <div><span>ORBIT CLASS</span><strong>{profile.orbit}</strong></div>
          <div><span>PROGRAM</span><strong>{profile.operator}</strong></div>
        </div>
        <SatellitePositionReadout norad={profile.norad} />
        <div className="seo-action-band">
          <div><strong>Follow this spacecraft in 3D</strong><p>Opens the live CUPOLA scene with the satellite selected. Position availability depends on current validated orbital elements.</p></div>
          <a className="seo-primary-cta" href={"/explore?satellite=" + encodeURIComponent(profile.norad)}>Open 3D tracker ↗</a>
        </div>
        <div className="seo-article-grid">
          <article className="seo-article">
            <section>
              <h2>Mission and observations</h2>
              <p>{profile.mission}</p>
            </section>
            <section>
              <h2>How to read the orbital position</h2>
              <p>{profile.interpret}</p>
            </section>
            <section>
              <h2>Important distinction</h2>
              <p>{profile.distinction}</p>
              <p>CUPOLA uses orbital elements and SGP4 to estimate position and ground track. These are mathematical predictions rather than directly measured real-time spacecraft coordinates. Old or unverified source data may prevent a current result from appearing.</p>
            </section>
            <section>
              <h2>Mission source</h2>
              <p>Read the spacecraft's scientific and operational background from the mission organization.</p>
              <a className="seo-reference-link" href={profile.officialUrl} target="_blank" rel="noopener noreferrer">{profile.officialLabel} ↗</a>
            </section>
          </article>
          <aside className="seo-side" aria-labelledby="related-title">
            <h2 id="related-title">Explore more spacecraft</h2>
            {otherSatellites.map((satellite) => (
              <Link key={satellite.norad} href={satellitePath(satellite)}><span>{satellite.tag}</span><strong>{satellite.name}</strong></Link>
            ))}
            <Link className="seo-all" href="/satellites">All satellites →</Link>
          </aside>
        </div>
        <footer className="seo-footer">CUPOLA° · Orbital visualization is not a certified navigation service. <Link href="/satellites">Satellite Atlas</Link></footer>
      </div>
    </main><EditorialFooter/></div>
  );
}
