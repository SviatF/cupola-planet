import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight, ShieldCheck, BookOpen, ScanEye, Globe2} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
import {featuredArchive} from "@/components/editorial/FeaturedAtlas";
import {SceneVisual} from "@/components/editorial/SceneFrame";

export const metadata:Metadata={
 title:"Learn — Interpreting Earth Observations and Orbital Science | CUPOLA",
 description:"Original CUPOLA field notes on Amazon understory fires, Greenland's melt ponds and Earth's night lights, with primary NASA sources and clear limits on what orbiting sensors reveal.",
 alternates:{canonical:"/learn"}
};

const readings={
 "amazon-understory":{
  question:"What is actually detected?",
  insight:"A satellite does not see beneath dense forest exactly as a person looking from above would. Multi-band optical observations, especially shortwave infrared, help distinguish recent burn scars, hot materials and changes in vegetation. But a satellite image can miss a low-intensity understory fire when the canopy remains intact or when clouds and smoke obscure the surface.",
  interpretation:"The Amazon imagery is an archival case study, not a claim about conditions this week. Looking at it alongside NASA's account shows why visible smoke, bright infrared pixels, burned vegetation and incident boundaries must be treated as different kinds of evidence. A hot spot is a detection at a sensor's spatial and temporal resolution, not the drawn perimeter of a fire.",
  application:"CUPOLA's Earth Events interface follows this distinction: NASA FIRMS thermal anomalies are shown as detections with source timing, not a guaranteed live map of every active flame. Confirmed incident reports and modelled forecasts need different labels.",
  uncertainty:"No single pass determines the total affected area, the ignition cause or the current extent. Repeated observations and independent validation are required."
 },
 "greenland-melt":{
  question:"Why do blue ponds matter?",
  insight:"In a July 2, 2025 Landsat 9 view, blue water collected across the white surface of western Greenland's ice sheet. The colour is visually striking, but the useful signal is the distribution and persistence of meltwater. Ponds can darken the surface, change its reflectivity and, where they drain through cracks, influence ice motion.",
  interpretation:"This is a seasonal snapshot, not a full-year ice-budget measurement. Annual changes in ice mass require observations over time and multiple methods. Even a very large melt pond cannot, by itself, establish the rate of sea-level rise or the long-term trajectory of the ice sheet.",
  application:"A CUPOLA science story should keep acquisition date, satellite instrument, location and interpretation side-by-side. Our scene illustrates Earth from orbit; it does not silently turn a regional Landsat observation into a simultaneous global photograph.",
  uncertainty:"Cloud coverage, acquisition geometry, surface snow and follow-up dates affect what can be inferred. This archived image is not a current view of Greenland."
 },
 "lights-at-night":{
  question:"What do Earth's lights measure?",
  insight:"An astronaut photograph reveals luminous roads and metropolitan clusters, but it is a camera view from a particular orbit and exposure. VIIRS nighttime products instead record calibrated radiance using a different sensor and processing chain. Those are useful but distinct data types.",
  interpretation:"A bright region does not directly equal a population count, electricity use or economic output. Artificial-light direction, cloud cover, lunar illumination, viewing angle and compositing methods all affect the appearance of nighttime Earth.",
  application:"CUPOLA combines a calculated day-night boundary with labelled night-light textures. The solar geometry can update continuously while a surface radiance composite remains historical or gap-filled; changing the clock does not refresh the satellite measurements.",
  uncertainty:"A visual change between two renderings is not necessarily a real change in lights on the ground. Comparisons need consistent products, corrections and acquisition metadata."
 }
} as const;

const topics=[
 {title:"What does near-live imagery mean?",text:"A sensor observes a place; agencies process and publish its product later. Capture time, delivery delay and geographic footprint differ for every layer.",href:"/earth/clouds"},
 {title:"How can an orbit be predicted?",text:"CUPOLA uses catalogued orbital elements and SGP4 to estimate positions. Propagation is mathematical prediction, not a satellite's live GPS feed.",href:"/satellites"},
 {title:"Where is the night boundary?",text:"Solar geometry computes Earth's terminator. The visual atmosphere and cloud texture require their own separate models and measurements.",href:"/earth/day-and-night"}
];

export default function LearnPage(){return <EditorialPage eyebrow="CUPOLA / THE FIELD NOTES" title="Look a little closer." intro="Three observations from the NASA archive, each with a different lesson in how to read Earth imagery.">
 <nav className="ae26-learn-index" aria-label="Field note chapters">{featuredArchive.map((item,i)=><a href={"#"+item.id} key={item.id}><span>{String(i+1).padStart(2,"0")}</span>{item.title}<ArrowUpRight size={14}/></a>)}</nav>
 <div className="ae26-learning-articles">
 {featuredArchive.map((item,i)=>{const note=readings[item.id];return <article id={item.id} className="ae26-learning-note" key={item.id}>
   <div className="ae26-learning-photo"><SceneVisual id={item.sceneId} variant="wide" label="CUPOLA 3D / VISUAL CONTEXT"/><span>NASA REFERENCE · {item.acquired} · SOURCE LINKED BELOW</span></div>
   <div className="ae26-learning-copy">
     <p className="ae-section-kicker">FIELD NOTE / {String(i+1).padStart(2,"0")}</p>
     <h2>{item.title}</h2>
     <p className="ae26-learning-summary">{note.insight}</p>
     <p className="ae26-learning-boundary"><ShieldCheck size={15}/>{note.uncertainty}</p>
     <details className="ae26-deep-reading"><summary>Read the full scientific interpretation <ArrowUpRight size={14}/></summary>
       <div><h3>What we can conclude</h3><p>{note.interpretation}</p>
       <h3>How CUPOLA presents it</h3><p>{note.application}</p></div>
     </details>
     <a className="ae26-source-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Original NASA record <ArrowUpRight size={14}/></a>
   </div>
 </article>})}
 </div>
 <section className="ae26-learn-footer"><p className="ae-section-kicker">MORE TO EXPLORE</p><div>{topics.map(t=><Link href={t.href} key={t.title}><strong>{t.title}</strong><p>{t.text}</p><ArrowUpRight size={16}/></Link>)}</div></section>
 <ExploreCallout title="Read Earth through the scene" body="Explore the original 3D globe with separately labelled source imagery, solar geometry and orbital predictions."/>
 </EditorialPage>;}
