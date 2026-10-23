import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight,Globe2,Orbit,ShieldCheck,ArrowRight,Radio} from "lucide-react";
import {EditorialHeader,EditorialFooter,ExploreCallout} from "@/components/editorial/EditorialShell";
import {SceneVisual} from "@/components/editorial/SceneFrame";
import {satellitePath,satelliteProfiles} from "@/lib/seo/satellites";
import {absoluteUrl} from "@/lib/seo/site";
export const metadata:Metadata={
 title:"Satellite Atlas — Explore Real Spacecraft | CUPOLA",
 description:"Explore the International Space Station, Hubble, NOAA, GOES and Landsat missions. Verified scientific context and separately calculated SGP4 orbital positions on CUPOLA's actual 3D Earth.",
 alternates:{canonical:"/satellites"},
 openGraph:{title:"CUPOLA° Satellite Atlas",type:"website",url:"/satellites",
 description:"Six mission-specific, source-grounded spacecraft profiles linked to CUPOLA's actual 3D Earth."}
};
export default function SatelliteAtlasPage(){
 const structured={"@context":"https://schema.org","@type":"CollectionPage",
 name:"CUPOLA Satellite Atlas",url:absoluteUrl("/satellites"),
 description:"A curated educational satellite tracking directory.",
 mainEntity:{"@type":"ItemList",itemListElement:satelliteProfiles.map((profile,i)=>({
 "@type":"ListItem",position:i+1,name:profile.name,url:absoluteUrl(satellitePath(profile))
 }))}};
 return <div className="atlas-site">
   <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structured).replace(/</g,"\\u003c")}}/>
   <EditorialHeader/>
   <main className="atlas-satellites">
     <section className="atlas-sat-hero">
      <SceneVisual id="satellite-atlas-hero" variant="hero" label="CUPOLA ORBITAL SCENE"/>
      <div className="atlas-sat-hero-content"><p className="ae-kicker">CUPOLA / SPACECRAFT DIRECTORY</p><h1>Beyond our<br/><em>planet.</em></h1>
       <p>Discover the objects orbiting Earth, why they're there, and how their calculated positions connect to our changing planet.</p>
       <Link className="ae-cta-primary" href="/explore"><Globe2 size={17}/> Open the 3D Tracker <ArrowRight size={16}/></Link>
      </div>
      <div className="atlas-sat-hero-bottom"><span>06 CURATED SPACECRAFT</span><span>SGP4 ORBIT PREDICTIONS</span><span>MISSION-SPECIFIC SOURCES</span></div>
     </section>
     <div className="atlas-sat-body">
       <section className="atlas-sat-intro"><p className="ae-kicker">EXPLORE / SATELLITE ATLAS</p><div><h2>Real missions.<br/>Extraordinary perspective.</h2><p>Every profile is connected to an actual NORAD catalog entry. Positions are estimated using published orbital elements and do not represent direct telemetry. The mission context comes from the responsible scientific and operating organizations.</p></div></section>
       <section className="atlas-sat-grid" aria-label="Curated spacecraft">
        {satelliteProfiles.map((profile,i)=><Link href={satellitePath(profile)} key={profile.norad} className="atlas-sat-card">
          <SceneVisual id={"satellite-"+profile.norad} variant="card" label={profile.tag}/>
          <div className="atlas-sat-card-content"><div className="atlas-sat-meta"><span>MISSION 0{i+1}</span><span>NORAD {profile.norad}</span></div>
          <h3>{profile.name}</h3><p>{profile.intro}</p><div className="atlas-sat-card-bottom"><span><Orbit size={14}/> {profile.orbit}</span><span>Explore mission <ArrowUpRight size={16}/></span></div></div>
         </Link>)}
       </section>
       <section className="atlas-sat-explain"><div><p className="ae-kicker">HOW THE TRACKER WORKS</p><h2>Calculated orbits.<br/>Transparent science.</h2><p>Satellite positions are calculated from published element sets using SGP4. When an orbit becomes stale or an upstream source is unavailable, CUPOLA should flag the degraded result rather than present an old point as newly measured.</p></div>
       <div className="atlas-sat-steps"><span><Radio size={19}/> Source orbital elements</span><span><Orbit size={19}/> SGP4 mathematical propagation</span><span><ShieldCheck size={19}/> Epoch and provenance validation</span><span><Globe2 size={19}/> Visualized on the actual globe</span></div></section>
       <ExploreCallout title="Follow the orbit yourself" body="Select a mission above to view its sourced context and available modelled coordinates, then jump directly into the same 3D Earth scene."/>
     </div>
   </main><EditorialFooter/>
 </div>;
}
