import type {Metadata} from "next";
import Link from "next/link";
import {ArrowRight, ArrowUpRight, Satellite, Globe2, Waves, Zap, Layers3, BookOpen, Telescope, Newspaper, ShieldCheck, PlayCircle, CloudSun, Orbit, Radio, Compass} from "lucide-react";
import {EditorialHeader,EditorialFooter,Eyebrow} from "@/components/editorial/EditorialShell";
import {LiveHeroScene,SceneVisual,OriginalSceneFilm,getApprovedSceneAsset} from "@/components/editorial/SceneFrame";
import {FeaturedAtlas,FieldNotes} from "@/components/editorial/FeaturedAtlas";
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
     <div className="ae-hero-coordinate"><span>DAWN / EARTH TERMINATOR</span><strong>Following Earth’s sunrise</strong><small>UTC solar geometry · mixed-age source imagery</small></div>
     <span className="ae-hero-index">01 / EARTH OBSERVATORY</span>
   </section>
   <div className="ae-home-content">
    <FeaturedAtlas/>

    <section className="ae-channel-grid" aria-label="Featured CUPOLA collections">
      <Link href="/earth/daily" className="ae-channel-card">
       <div className="ae-channel-icon"><Newspaper size={21}/></div><div><span>THE OBSERVATION LOG</span><strong>Daily Earth Reports</strong><p>Source-locked reports. Publication follows scientific review.</p></div><span className="ae-channel-arrow"><ArrowUpRight size={20}/></span>
      </Link>
      <Link href="/earth/cities" className="ae-channel-card">
       <div className="ae-channel-icon"><Compass size={21}/></div><div><span>DISCOVER PLACES</span><strong>Cities from Space</strong><p>Explore place-based science while verified city views are prepared.</p></div><span className="ae-channel-arrow"><ArrowUpRight size={20}/></span>
      </Link>
      <Link href="/satellites" className="ae-channel-card">
       <div className="ae-channel-icon"><Satellite size={21}/></div><div><span>OBJECTS IN ORBIT</span><strong>Satellite Atlas</strong><p>Curated missions with source-labelled, calculated orbital positions.</p></div><span className="ae-channel-arrow"><ArrowUpRight size={20}/></span>
      </Link>
    </section>

    <FieldNotes/>

    <section className="ae-editorial-interlude" aria-labelledby="ae-interlude-title">
      <div className="ae-interlude-statement">
        <p className="ae-section-kicker">CUPOLA / LOOK BEYOND THE RENDER</p>
        <h2 id="ae-interlude-title">Beautiful is only the beginning. <em>Evidence makes it matter.</em></h2>
        <p>The same planet can be rendered right now and contain measurements taken at different times. We keep the observation, prediction and visualization distinct — so a cinematic image becomes a way to understand something real.</p>
        <Link href="/methodology" className="ae-inline-button">Read our method <ArrowUpRight size={16}/></Link>
      </div>
      <div className="ae-interlude-detail">
        <div className="ae-interlude-fact"><span>01 / OBSERVED</span><div><h3>When was the instrument looking?</h3><p>Timestamped satellite measurements carry a regional footprint and acquisition time.</p></div></div>
        <div className="ae-interlude-fact"><span>02 / COMPUTED</span><div><h3>What does the model calculate?</h3><p>Sunlight, orbit positions and forecasts have their own geometry and validity time.</p></div></div>
        <div className="ae-interlude-fact"><span>03 / RENDERED</span><div><h3>What is in the camera frame?</h3><p>Our own 3D engine combines these layers. Rendering now never implies every pixel was acquired now.</p></div></div>
        <Link href="/data-sources" className="ae-interlude-source">Explore the source directory <ArrowUpRight size={16}/></Link>
      </div>
      <div className="ae-interlude-frame">
        {getApprovedSceneAsset("from-orbit-feature")
          ? <SceneVisual id="from-orbit-feature" variant="wide" label="ORIGINAL CUPOLA 3D SCENE"/>
          : <div className="ae-interlude-live">
              <p>FROM THE ORBITAL CAMERA</p>
              <strong>Explore the actual Earth, not a fabricated still.</strong>
              <span>The original WebGL view keeps its cloud and source information accessible until a reviewed capture is ready.</span>
              <Link href="/explore">Open the observatory <ArrowUpRight size={17}/></Link>
            </div>}
      </div>
    </section>

    <section className="ae-section ae-satellite-section">
      <div className="ae-section-heading"><div><p className="ae-section-kicker">MISSION DIRECTORY / ORIGINAL SOURCES</p><h2>The objects above us</h2><p>Six curated missions, each with its own scientific context and orbital estimate.</p></div><Link href="/satellites" className="ae-text-link">Explore the Satellite Atlas <ArrowRight size={15}/></Link></div>
      <div className="ae-mission-grid">{satelliteProfiles.slice(0,4).map((profile,i)=><Link href={satellitePath(profile)} key={profile.norad} className="ae-mission-card"><div className="ae-mission-visual"><Orbit size={i%2===0?44:37}/><span>{profile.tag}</span></div><div className="ae-mission-meta"><span>NORAD {profile.norad}</span><ArrowUpRight size={15}/></div><h3>{profile.name}</h3><p>{profile.orbit} · Orbital data is calculated, not telemetry</p></Link>)}</div>
    </section>

    <section className="ae-watch-block">
      <div className="ae-section-heading"><div><p className="ae-section-kicker">CUPOLA / ORIGINAL SCENE MEDIA</p><h2>From the globe. Not from a prompt.</h2><p>Actual 3D render captures and motion studies — clearly distinguished from sensor observations.</p></div><Link href="/methodology" className="ae-text-link">How we verify imagery <ArrowRight size={15}/></Link></div>
      <OriginalSceneFilm id="home-hero"/>
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
