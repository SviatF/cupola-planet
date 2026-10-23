import type {Metadata} from "next";
import Link from "next/link";
import {ArrowRight, ArrowUpRight, Satellite, Globe2, Waves, Zap, Layers3, BookOpen, Telescope, Newspaper, ShieldCheck, PlayCircle, CloudSun, Orbit, Radio, Compass} from "lucide-react";
import {EditorialHeader,EditorialFooter,Eyebrow} from "@/components/editorial/EditorialShell";
import {CinematicFeature,LiveHeroScene,SceneVisual,WatchUnavailable} from "@/components/editorial/SceneFrame";
import {satelliteProfiles,satellitePath} from "@/lib/seo/satellites";
import {approvedDailyReports,dailyReportPath} from "@/lib/editorial/publishedDaily";
import "./atlas.css";

export const metadata:Metadata={
 title:"CUPOLA° — Earth from Space, Explained",
 description:"Explore a cinematic Earth observatory: a real 3D globe, verified source-based Earth reporting, cities from orbit and curated satellite missions. Distinguish satellite observations, predictions and historical imagery.",
 alternates:{canonical:"/"},
 openGraph:{type:"website",title:"CUPOLA° — See What Is Happening on Earth",url:"/",description:"Explore Earth through CUPOLA's interactive 3D globe, source-labelled observations and scientific stories."}
};
const published=approvedDailyReports.slice(0,3);
export default function Home(){
 return <div className="atlas-site">
  <EditorialHeader/>
  <main>
   <section className="ae-hero" aria-labelledby="ae-hero-heading">
     <LiveHeroScene/>
     <div className="ae-hero-content">
       <p className="ae-hero-overline">A LIVING PLANET. A CLEARER TOMORROW.</p>
       <h1 id="ae-hero-heading">See what is<br/>happening <em>on Earth.</em></h1>
       <p className="ae-hero-sub">An extraordinary view of our planet, built from actual Earth observations, scientific models and orbital calculations. Explore what we can see — and what the data really means.</p>
       <div className="ae-hero-buttons"><Link className="ae-cta-primary" href="/explore"><Globe2 size={18}/> Explore the Scene <ArrowRight size={17}/></Link><Link className="ae-cta-outline" href="/earth/daily"><Newspaper size={17}/> Daily Earth Reports</Link></div>
       <p className="ae-hero-provenance"><ShieldCheck size={13}/> Instrument observations and simulated layers are labelled separately.</p>
     </div>
     <div className="ae-hero-coordinate"><span>LIVE 3D EARTH MODEL</span><strong>One planet. Many data sources.</strong><small>Calculated positions · timestamped source imagery</small></div>
     <span className="ae-hero-index">01 / EARTH OBSERVATORY</span>
   </section>
   <div className="ae-home-content">
    <section className="ae-section ae-top-stories">
      <div className="ae-section-heading"><div><p className="ae-section-kicker">CUPOLA / EXPLORE BY PERSPECTIVE</p><h2>Stories our planet can tell</h2><p>Start with real scientific collections — not invented breaking headlines.</p></div><Link href="/learn" className="ae-text-link">Explore the library <ArrowRight size={15}/></Link></div>
      <div className="ae-feature-grid">
       <CinematicFeature id="feature-earth-clouds" href="/earth" label="EARTH OBSERVATIONS" title="A planet in constant motion" description="How cloud observations, day-night geometry and Earth's surface layers come together."/>
       <CinematicFeature id="feature-moon" href="/learn" label="SPACE SCIENCE" title="An extraordinary new perspective" description="Understand the difference between actual observations and calculated views."/>
       <CinematicFeature id="feature-night" href="/earth" label="EARTH AT NIGHT" title="The world after dark" description="Night lights, Earth rotation and the story a satellite image can — and cannot — tell."/>
      </div>
    </section>

    <section className="ae-channel-grid" aria-label="Featured CUPOLA collections">
      <Link href="/earth/daily" className="ae-channel-card">
       <div className="ae-channel-icon"><Newspaper size={21}/></div><div><span>THE OBSERVATION LOG</span><strong>Daily Earth Reports</strong><p>Daily briefings assembled from verified facts and source timestamps.</p></div><span className="ae-channel-arrow"><ArrowUpRight size={20}/></span>
      </Link>
      <Link href="/earth/cities" className="ae-channel-card">
       <div className="ae-channel-icon"><Compass size={21}/></div><div><span>DISCOVER PLACES</span><strong>Cities from Space</strong><p>A curated gateway to geographically grounded scenes.</p></div><span className="ae-channel-arrow"><ArrowUpRight size={20}/></span>
      </Link>
      <Link href="/satellites" className="ae-channel-card">
       <div className="ae-channel-icon"><Satellite size={21}/></div><div><span>OBJECTS IN ORBIT</span><strong>Satellite Atlas</strong><p>Real spacecraft. Mission stories. Calculated orbital positions.</p></div><span className="ae-channel-arrow"><ArrowUpRight size={20}/></span>
      </Link>
    </section>

    <section className="ae-home-twin">
      <div className="ae-report-block">
        <div className="ae-mini-heading"><span className="ae-blue-bar"/> <strong>WHAT HAPPENED ON EARTH?</strong><Link href="/earth/daily">All reports <ArrowRight size={13}/></Link></div>
        <div className="ae-report-intro"><Eyebrow>DAILY EARTH / OBSERVED &amp; VERIFIED</Eyebrow><h2>Today's headlines deserve better evidence.</h2><p>CUPOLA separates what instruments recorded, what agencies reported and what numerical models predict. Every approved daily report preserves that distinction.</p><Link href="/earth/daily" className="ae-inline-button">Browse published reports <ArrowRight size={16}/></Link></div>
        {published.length>0?<div className="ae-published-row">{published.map(r=><Link href={dailyReportPath(r.day)} key={r.day}><time>{r.day}</time><strong>{r.ledger.facts.length} selected verified records</strong><ArrowUpRight size={15}/></Link>)}</div>:
         <div className="ae-pending-state"><Radio size={17}/><div><strong>Editorial review in progress</strong><small>Dated articles will appear only after source and scientific approval. No simulated breaking news.</small></div></div>}
      </div>
      <div className="ae-orbit-block">
        <div className="ae-mini-heading"><span className="ae-blue-bar"/><strong>FROM ORBIT</strong><Link href="/explore">Open view <ArrowRight size={13}/></Link></div>
        <SceneVisual id="from-orbit-feature" variant="wide" label="SCENE CAPTURE COLLECTION"/>
        <div className="ae-orbit-copy"><h3>One view. A thousand questions.</h3><p>Every visual published here will be generated from CUPOLA's own scene, with acquisition and render timestamps preserved.</p></div>
      </div>
    </section>

    <section className="ae-section ae-satellite-section">
      <div className="ae-section-heading"><div><p className="ae-section-kicker">MISSION DIRECTORY / ORIGINAL SOURCES</p><h2>The objects above us</h2><p>Six curated missions, each with its own scientific context and orbital estimate.</p></div><Link href="/satellites" className="ae-text-link">Explore the Satellite Atlas <ArrowRight size={15}/></Link></div>
      <div className="ae-mission-grid">{satelliteProfiles.slice(0,4).map((profile,i)=><Link href={satellitePath(profile)} key={profile.norad} className="ae-mission-card"><div className="ae-mission-visual"><Orbit size={i%2===0?44:37}/><span>{profile.tag}</span></div><div className="ae-mission-meta"><span>NORAD {profile.norad}</span><ArrowUpRight size={15}/></div><h3>{profile.name}</h3><p>{profile.orbit} · Orbital data is calculated, not telemetry</p></Link>)}</div>
    </section>

    <section className="ae-watch-block">
      <div className="ae-section-heading"><div><p className="ae-section-kicker">CUPOLA / WATCH &amp; LEARN</p><h2>See the science unfold.</h2><p>Scene films, visual explainers and transparent observation timelines.</p></div><Link href="/learn" className="ae-text-link">Understanding the data <ArrowRight size={15}/></Link></div>
      <WatchUnavailable/>
    </section>

    <section className="ae-proof-strip"><div className="ae-proof-heading"><Layers3 size={24}/><strong>SOURCE TRANSPARENCY</strong><small>Open data. Clear methodology. Greater trust.</small></div>
      <div className="ae-proof-item"><Telescope size={22}/><div><strong>Satellite observations</strong><span>NOAA · NASA · USGS and agency feeds</span></div></div>
      <div className="ae-proof-item"><CloudSun size={22}/><div><strong>Observed ≠ forecast</strong><span>Every layer has its own provenance</span></div></div>
      <div className="ae-proof-item"><BookOpen size={22}/><div><strong>Readable science</strong><span>Context grounded in CUPOLA data</span></div></div>
      <Link href="/methodology" className="ae-proof-link">Our methodology <ArrowRight size={14}/></Link>
    </section>
   </div>
  </main>
  <EditorialFooter/>
 </div>;
}
