import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
export const metadata:Metadata={title:"Earth Events — Earthquakes, Storms & Space Weather | CUPOLA",description:"Learn how CUPOLA distinguishes instrument detections, agency incident reports and forecasts for earthquakes, wildfires, lightning and tropical cyclones.",alternates:{canonical:"/events"}};
const rows=[
 {label:"01 / USGS",title:"Earthquakes",description:"Origin time, magnitude and depth from USGS. A recent-events feed is not a complete historical catalog."},
 {label:"02 / NHC & AGENCIES",title:"Tropical cyclones",description:"Bulletin positions and model forecasts refer to different validity times and ocean basins."},
 {label:"03 / NASA FIRMS",title:"Wildfire detections",description:"A thermal hotspot is a detection, not a mapped fire perimeter or verified incident boundary."},
 {label:"04 / GLM & NOAA",title:"Lightning & aurora",description:"Instrument-observed flashes and forecast probabilities are shown as different kinds of evidence."}
];
export default function EventsHub(){return <EditorialPage eyebrow="CUPOLA / EARTH INTELLIGENCE" title="Signals from a moving planet." intro="Earthquakes, storms, fires and space weather — placed in context, not just plotted as points.">
 <section className="ae26-route-list" aria-label="Observation and forecast categories">{rows.map(r=><article className="ae26-route ae26-route-static" key={r.title}><span>{r.label}</span><div><h2>{r.title}</h2><p>{r.description}</p></div></article>)}</section>
 <p className="ae26-evidence-line">A timestamped detection is not the same as a confirmed incident or a forecast. <Link href="/data-sources">Read provider limitations <ArrowUpRight size={13}/></Link></p>
 <ExploreCallout title="Follow the observations" body="Open Earth Data in the interactive scene to inspect available events and their actual coordinates."/>
 </EditorialPage>}