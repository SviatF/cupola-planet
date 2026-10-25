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
   <div className="ae-home-content ae26-home">
    <FeaturedAtlas/>
    <section className="ae26-explore" aria-labelledby="ae26-explore-heading">
      <div className="ae26-explore-lead"><p className="ae-section-kicker">02 / GO DEEPER</p><h2 id="ae26-explore-heading">Choose your perspective.</h2><p>Explore the science without losing sight of the planet.</p></div>
      <div className="ae26-explore-links">
       <Link href="/earth" className="ae26-explore-link"><span>EARTH</span><strong>Clouds, light &amp; change</strong><ArrowUpRight size={18}/></Link>
       <Link href="/events" className="ae26-explore-link"><span>EVENTS</span><strong>What instruments detect</strong><ArrowUpRight size={18}/></Link>
       <Link href="/satellites" className="ae26-explore-link"><span>IN ORBIT</span><strong>Spacecraft &amp; their paths</strong><ArrowUpRight size={18}/></Link>
       <Link href="/earth/daily" className="ae26-explore-link"><span>THE JOURNAL</span><strong>{published.length ? "Reviewed daily observations" : "Daily reports, when verified"}</strong><ArrowUpRight size={18}/></Link>
      </div>
    </section>
    <FieldNotes/>
    <section className="ae26-closing" aria-labelledby="ae26-closing-heading">
      <div><p className="ae-section-kicker">04 / THE ORIGINAL OBSERVATORY</p><h2 id="ae26-closing-heading">Go beyond the image.</h2><p>CUPOLA brings source-labelled observations and calculated phenomena together on one interactive globe. Each data layer has its own clock.</p>
      <div className="ae26-closing-links"><Link href="/explore">Open the 3D Earth <ArrowUpRight size={15}/></Link><Link href="/data-sources">Inspect the sources <ArrowUpRight size={15}/></Link></div></div>
      <div className="ae26-media-column">
       {getApprovedSceneAsset("home-hero")?.videoUrl?<OriginalSceneFilm id="home-hero"/>:
        <div className="ae26-media-unavailable"><span>ORIGINAL SCENE MEDIA</span><strong>Real frames. No fictional footage.</strong><p>Reviewed scene films are added only after capture and source verification.</p></div>}
      </div>
    </section>
   </div>
  </main>
  <EditorialFooter/>
 </div>;
}
