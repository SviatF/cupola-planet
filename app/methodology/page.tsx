import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
export const metadata:Metadata={title:"Methodology — How CUPOLA Visualizes Earth | CUPOLA",description:"CUPOLA's scientific methodology: cloud footprints and delays, historical surface textures, SGP4 orbital predictions, solar geometry and editorial source verification.",alternates:{canonical:"/methodology"}};
const sections=[
 {title:"Observation time is not render time",body:"CUPOLA draws the scene now, while source pixels may have been recorded minutes, hours or years earlier. We keep acquisition time, rendered time, source identity and geographic footprint separate."},
 {title:"Clouds have geographic limits",body:"NOAA GOES and JMA Himawari provide regional observations. Global gap-filling and forecast products are different classes of evidence, never silently labelled as the same observed cloud layer."},
 {title:"The ground map is historical",body:"NASA basemaps provide the surface where fresh satellite observations do not. Verified VIIRS land pixels may be selectively blended; that is not a continuous real-time Earth photograph."},
 {title:"Night radiance is measured",body:"VIIRS and historical composites record light reaching sensors. The day-night terminator is computed from solar geometry, rather than observed by one full-Earth camera."},
 {title:"Orbits are mathematical predictions",body:"SGP4 predicts spacecraft positions from catalogued orbital elements. Element epochs affect accuracy. Predictions are not onboard telemetry or a guarantee of visibility from the ground."},
 {title:"Reports begin with sourced facts",body:"Source identifiers, timestamps and numeric measurements precede editorial writing. DeepSeek can explain validated facts but may not invent figures or incidents; publication requires scientific and editorial review."},
 {title:"Cinematic media is a visualization",body:"CUPOLA WebGL renders combine layers of different ages. A new render timestamp does not refresh satellite imagery. Camera-motion films are not passed off as observed satellite time-lapses."}
];
export default function Methodology(){return <EditorialPage eyebrow="CUPOLA / METHODOLOGY" title="An honest picture of Earth." intro="What we measure, what we compute, and what the camera illustrates. Seven principles behind every CUPOLA view.">
 <div className="ae26-method-layout">
  <nav className="ae26-method-nav" aria-label="Methodology sections"><p>IN THIS GUIDE</p>{sections.map((s,i)=><a href={`#method-${i+1}`} key={s.title}><span>{String(i+1).padStart(2,"0")}</span>{s.title}</a>)}</nav>
  <div className="ae26-method-content">{sections.map((s,i)=><section className="ae26-method-section" id={`method-${i+1}`} key={s.title}><span>{String(i+1).padStart(2,"0")} / SCIENTIFIC PRINCIPLE</span><h2>{s.title}</h2><p>{s.body}</p></section>)}</div>
 </div>
 <p className="ae26-evidence-line">Original instruments and product specifications are referenced in the <Link href="/data-sources">data source directory <ArrowUpRight size={13}/></Link>.</p>
 <ExploreCallout title="The model, in context" body="Open the 3D Earth and inspect the source labels used for clouds, night lights, orbit estimates and events."/>
 </EditorialPage>}