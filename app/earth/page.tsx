import type {Metadata} from "next";
import Link from "next/link";
import {CloudSun,SunMoon,Flame,Satellite,ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
import {SceneVisual} from "@/components/editorial/SceneFrame";
export const metadata:Metadata={title:"Earth Observatory — Clouds, Light & Planetary Data | CUPOLA",description:"Understand how CUPOLA combines satellite cloud observations, historical basemaps, orbital geometry and verified Earth events in a three-dimensional Earth observatory.",alternates:{canonical:"/earth"}};
const groups=[
{title:"Clouds from space",text:"Geostationary cloud imagery covers selected observed footprints. Additional modelled or visual sources may fill gaps; CUPOLA labels those differences instead of calling every cloud a live photograph.",href:"/earth/clouds",icon:CloudSun},
{title:"Daylight and the terminator",text:"The line between day and night follows calculated Sun-Earth geometry. It changes continuously; this is astronomy, not a continually refreshed surface camera.",href:"/explore",icon:SunMoon},
{title:"Night lights",text:"VIIRS nighttime radiance imagery can include historic composites and daily gap-filled products. Each scene is distinguished from a same-minute observation.",href:"/explore",icon:Flame},
{title:"Spacecraft context",text:"CUPOLA propagates published orbital elements through SGP4 to estimate spacecraft positions; this is a prediction rather than direct satellite telemetry.",href:"/satellites",icon:Satellite},
];
export default function EarthHub(){return <EditorialPage eyebrow="CUPOLA / EARTH OBSERVATORY" title="A planet in constant motion." intro="From the curve of a continent to the edge of a cloud system, CUPOLA connects a cinematic 3D planet with traceable observations and honest science.">
 <div className="ae-editorial-panel"><SceneVisual id="earth-observatory-cover" variant="hero" label="CUPOLA GENERATED VIEW"/><h2>What is actually being shown?</h2><p>The 3D globe uses different sources for different questions. Surface textures can be historical; cloud layers have their own observation times and regional limitations; sunlight and satellite orbits are calculated. The observation timestamp, rendering timestamp and model validity time are not interchangeable.</p></div>
 <div className="ae-content-grid">{groups.map(({title,text,href,icon:Icon})=><Link href={href} key={title} className="ae-editorial-panel"><Icon size={27} color="#82cdf8"/><h2>{title}</h2><p>{text}</p><span className="ae-inline-button">Explore <ArrowUpRight size={15}/></span></Link>)}</div>
 <ExploreCallout body="The interactive Earth is the primary evidence-aware experience. Open the globe to inspect clouds, source status, Sun, Moon, spacecraft and Earth events."/>
 </EditorialPage>}
