import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight, ShieldCheck, BookOpen, ScanEye, Globe2} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
import {featuredArchive} from "@/components/editorial/FeaturedAtlas";

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

export default function LearnPage(){return <EditorialPage eyebrow="CUPOLA / FIELD NOTES" title="Look closer. Understand more." intro="A photograph can reveal a pattern without explaining its cause. CUPOLA pairs beautiful Earth views with the instrument, observation date, interpretation and uncertainty needed to read them.">
 <section className="ae-learning-intro"><div><ScanEye size={22}/><span>THE EVIDENCE FIRST</span><h2>Three images. Three different scientific questions.</h2><p>These are selected historical NASA archives, not today's live observations. The explanations below are CUPOLA's own interpretation of what the imagery does — and does not — establish.</p></div><Link href="/data-sources">Browse primary data sources <ArrowUpRight size={16}/></Link></section>
 <div className="ae-learning-articles">
 {featuredArchive.map((item,i)=>{const note=readings[item.id];return <article id={item.id} className="ae-learning-note" key={item.id}>
   <div className="ae-learning-image"><img src={item.image} alt={item.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"/><span>{item.source} · {item.acquired}</span></div>
   <div className="ae-learning-body">
     <p className="ae-section-kicker">OBSERVATION NOTE / {String(i+1).padStart(2,"0")}</p>
     <h2>{item.title}</h2>
     <p className="ae-learning-lede">{item.summary}</p>
     <h3>{note.question}</h3><p>{note.insight}</p>
     <h3>What we can conclude</h3><p>{note.interpretation}</p>
     <h3>How CUPOLA presents it</h3><p>{note.application}</p>
     <div className="ae-learning-caveat"><ShieldCheck size={17}/><div><strong>Evidence boundary</strong><p>{note.uncertainty}</p></div></div>
     <div className="ae-learning-actions"><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Read the original NASA record <ArrowUpRight size={15}/></a><Link href={item.href==="/earth/night-lights"?item.href:"/explore"}>Explore CUPOLA <Globe2 size={15}/></Link></div>
   </div>
 </article>})}
 </div>
 <section className="ae-section"><div className="ae-section-heading"><div><p className="ae-section-kicker">UNDERSTAND THE ENGINE</p><h2>Explore the scientific foundations.</h2><p>Trace every visual layer back to its type of evidence.</p></div></div><div className="ae-content-grid">{topics.map(topic=><Link href={topic.href} className="ae-editorial-panel" key={topic.title}><BookOpen size={23}/><h2>{topic.title}</h2><p>{topic.text}</p><span className="ae-inline-button">Study this topic <ArrowUpRight size={15}/></span></Link>)}</div></section>
 <ExploreCallout body="Return to the globe to explore the same Sun-Earth geometry, orbital calculations and source-labelled Earth layers discussed in these notes."/>
 </EditorialPage>;}
