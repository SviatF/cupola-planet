import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight,Globe2,Orbit,ShieldCheck,ArrowRight,Radio} from "lucide-react";
import {EditorialHeader,EditorialFooter,ExploreCallout} from "@/components/editorial/EditorialShell";
import {SceneVisual,getApprovedSceneAsset} from "@/components/editorial/SceneFrame";
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
   <main className="ae26-satellite-page">
     <header className="ae26-satellite-intro">
       <p className="ae-section-kicker">CUPOLA / SATELLITE ATLAS</p>
       <h1>Objects above us.</h1>
       <p>Six real missions. What they do, where their calculated orbits take them, and how to follow them on the 3D globe.</p>
       <Link className="ae26-sat-open" href="/explore">Open the spacecraft tracker <ArrowUpRight size={16}/></Link>
     </header>
     {getApprovedSceneAsset("satellite-atlas-hero") && <SceneVisual id="satellite-atlas-hero" variant="hero" label="ORIGINAL 3D ORBIT CAPTURE"/>}
     <section className="ae26-sat-directory" aria-label="Curated spacecraft">
       <header className="ae26-section-head"><div><p className="ae-section-kicker">THE MISSION DIRECTORY</p><h2>Explore the fleet.</h2><p>Positions use published element sets and SGP4, not onboard live telemetry.</p></div></header>
       {satelliteProfiles.map((p,i)=><Link className="ae26-sat-row" href={satellitePath(p)} key={p.norad}>
         <span className="ae26-sat-count">{String(i+1).padStart(2,"0")}</span>
         <div><small>{p.tag} · NORAD {p.norad}</small><h3>{p.name}</h3><p>{p.intro}</p></div>
         <strong>{p.orbit}</strong><ArrowUpRight size={18}/>
       </Link>)}
     </section>
     <section className="ae26-sat-method"><div><p className="ae-section-kicker">SOURCE TO SCENE</p><h2>Every orbit has an epoch.</h2></div><p>Orbital positions are predicted from catalogued elements. CUPOLA keeps the estimate, its epoch and the mission's source information separate. <Link href="/methodology">Read the method <ArrowUpRight size={14}/></Link></p></section>
   </main><EditorialFooter/>
 </div>;
}
