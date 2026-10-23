import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
import {SceneVisual} from "@/components/editorial/SceneFrame";
export const metadata:Metadata={title:"Learn — Earth and Orbital Science | CUPOLA",description:"Understand near-live satellite imagery, night lights, calculated spacecraft positions and the limits of observation using CUPOLA's scientific 3D Earth model.",alternates:{canonical:"/learn"}};
const topics=[
{title:"What does near-live Earth imagery mean?",text:"A satellite sensor captures data at a time and location, then an agency processes and publishes it. Different layers have different latency and footprints."},
{title:"How does an orbital estimate work?",text:"CUPOLA uses element sets with SGP4 to calculate predicted orbital positions. The resulting path is not a spacecraft GPS feed and does not itself establish ground visibility."},
{title:"Why does Earth have a day-night boundary?",text:"The solar terminator follows the Sun-Earth geometry. We calculate the illumination state separately from what a particular satellite can physically image."},
{title:"How do night-light images differ?",text:"Radiance imagery may be a historical mosaic or a recent gap-filled composite. Clouds, stray light and sensor conditions limit interpretation of individual pixels."}
];
export default function LearnPage(){return <EditorialPage eyebrow="CUPOLA / LEARN" title="Understand what you're seeing." intro="CUPOLA is not only a beautiful camera. It is an invitation to understand the boundaries between observed data, mathematical prediction and artistic presentation.">
 <SceneVisual id="learn-hero" variant="hero" label="SCENE-BASED SCIENCE VISUAL"/>
 <div className="ae-content-grid">{topics.map((t,i)=><section className="ae-editorial-panel" key={t.title}><p className="ae-kicker">FIELD NOTE 0{i+1}</p><h2>{t.title}</h2><p>{t.text}</p><Link href={i===1?"/satellites":"/methodology"} className="ae-inline-button">Go deeper <ArrowUpRight size={14}/></Link></section>)}</div>
 <ExploreCallout body="A scientific explanation should lead directly to the observed or calculated behavior on the actual globe."/>
 </EditorialPage>}
