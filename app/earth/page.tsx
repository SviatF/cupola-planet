import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
import {SceneVisual,getApprovedSceneAsset} from "@/components/editorial/SceneFrame";
export const metadata:Metadata={title:"Earth Observatory — Clouds, Light & Planetary Data | CUPOLA",description:"Understand how CUPOLA combines satellite cloud observations, historical basemaps, orbital geometry and verified Earth events in a three-dimensional Earth observatory.",alternates:{canonical:"/earth"}};
const topics=[
 {label:"01 / ATMOSPHERE",title:"Clouds, as observed",description:"Regional satellite instruments record the changing atmosphere. Gaps and forecast imagery are labelled separately.",href:"/earth/clouds"},
 {label:"02 / DAY & NIGHT",title:"The moving terminator",description:"A calculated solar boundary — not a single continuously updated global photograph.",href:"/earth/day-and-night"},
 {label:"03 / NIGHT LIGHTS",title:"A planet after dark",description:"VIIRS radiance and historical composites reveal patterns, with time and sensor limitations.",href:"/earth/night-lights"},
 {label:"04 / SPACECRAFT",title:"Objects in orbit",description:"Explore mission context and positions estimated from published orbital elements.",href:"/satellites"}
];
export default function EarthHub(){return <EditorialPage eyebrow="CUPOLA / EARTH OBSERVATORY" title="Earth, seen more clearly." intro="One planet. Several instruments and models. Here is what each layer of the scene can actually tell us.">
 {getApprovedSceneAsset("from-orbit-feature") && <section className="ae26-approved-scene"><SceneVisual id="from-orbit-feature" variant="hero" label="REVIEWED ORIGINAL CUPOLA 3D SCENE"/></section>}
 <section className="ae26-route-list" aria-label="Explore Earth's scientific layers">{topics.map(t=><Link className="ae26-route" href={t.href} key={t.title}><span>{t.label}</span><div><h2>{t.title}</h2><p>{t.description}</p></div><ArrowUpRight size={18}/></Link>)}</section>
 <p className="ae26-evidence-line">Observation time, rendering time and model validity are not interchangeable. <Link href="/methodology">How we verify each layer <ArrowUpRight size={13}/></Link></p>
 <ExploreCallout title="See the planet in motion" body="Open the original 3D globe to inspect the selected layers and their available source information."/>
 </EditorialPage>}