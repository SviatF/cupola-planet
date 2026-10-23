import type {Metadata} from "next";
import Link from "next/link";
import {Activity,Flame,CloudLightning,CloudSun,ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
export const metadata:Metadata={title:"Earth Events — Earthquakes, Storms & Space Weather | CUPOLA",description:"Learn how CUPOLA distinguishes instrument detections, agency incident reports and forecasts for earthquakes, wildfires, lightning and tropical cyclones.",alternates:{canonical:"/events"}};
const rows=[
{title:"Earthquakes",type:"USGS VERIFIED EVENT TIMES",copy:"Locations, origin times, depth and magnitudes come from the USGS feed. A selected recent-event feed is not a complete historical earthquake census.",icon:Activity},
{title:"Tropical cyclones",type:"OFFICIAL ADVISORIES",copy:"NHC storm bulletins apply to specific ocean basins. Model tracks show forecasts, while reported storm positions refer to advisory validity times.",icon:CloudSun},
{title:"Wildfire activity",type:"DETECTION ≠ FIRE PERIMETER",copy:"NASA FIRMS hotspots are thermal detections; GDACS/EONET records are incident reports. Neither should be presented as a confirmed actively burning boundary.",icon:Flame},
{title:"Lightning and aurora",type:"OBSERVATION / MODEL",copy:"GOES GLM flash products have regional observational coverage; modeled lightning and NOAA aurora probability fields are forecasts, not direct sightings.",icon:CloudLightning},
];
export default function EventsHub(){return <EditorialPage eyebrow="CUPOLA / EARTH INTELLIGENCE" title="What is happening around the planet?" intro="Earth events are more than glowing pins. Every event has coordinates, a provider, a timestamp and a data type; those details determine what the visualization can honestly tell us.">
 <div className="ae-content-grid">{rows.map(r=><section key={r.title} className="ae-editorial-panel"><r.icon color="#8ad3ff" size={29}/><p className="ae-kicker">{r.type}</p><h2>{r.title}</h2><p>{r.copy}</p></section>)}</div>
 <section className="ae-editorial-panel"><h2>Explore actual observations</h2><p>In the scene, open <strong>EARTH DATA → EVENTS</strong> to browse available recent events and focus the 3D camera on their coordinates. The coverage and reporting delays vary by source. No unsupported global totals are fabricated.</p><Link href="/data-sources" className="ae-inline-button">Examine provider limitations <ArrowUpRight size={15}/></Link></section>
 <ExploreCallout href="/explore" body="Discover location-specific activity and navigate directly to real event coordinates in CUPOLA's Earth Intelligence controls."/>
 </EditorialPage>}
