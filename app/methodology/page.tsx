import type {Metadata} from "next";
import Link from "next/link";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
export const metadata:Metadata={title:"Methodology — How CUPOLA Visualizes Earth | CUPOLA",description:"CUPOLA's scientific methodology: cloud footprints and delays, historical surface textures, SGP4 orbital predictions, solar geometry and editorial source verification.",alternates:{canonical:"/methodology"}};
const sections=[
{title:"Observed data versus rendering time",body:"CUPOLA renders a scene at the viewer's current time, but underlying pixels may have been acquired minutes, hours or years earlier. Published figures must preserve a separate observedAt and renderedAt timestamp, plus source identity and coverage."},
{title:"Clouds and geographic coverage",body:"NOAA GOES and JMA Himawari provide regional geostationary cloud products. Other imagery and global forecast models can add visual context; these are marked separately rather than represented as the same observational layer."},
{title:"The historical ground map",body:"The default Earth surface can use historical NASA Blue Marble products. Daily VIIRS surface swaths may be selectively blended if validated; neither should be misdescribed as a continuous real-time full-globe photograph."},
{title:"Night radiance and illumination",body:"Night-time city radiance maps may use historical Black Marble composites or date-specific VIIRS products with temporal gap-filling. The Sun illumination boundary is computed with astronomical geometry rather than observed from a single full-Earth camera."},
{title:"Orbit propagation and spacecraft tracking",body:"CUPOLA computes SGP4-predicted positions from cataloged orbital elements. Accuracy depends on element epoch and provenance. Predictions are not direct live telemetry, and a ground track alone does not imply naked-eye visibility."},
{title:"Scientific reporting and DeepSeek",body:"A dated Earth report starts from immutable source IDs, original providers, timestamps and calculations already available in CUPOLA. DeepSeek can explain the facts in natural language but cannot invent numbers, events or providers. Scientific and editorial review gates determine publication."},
{title:"Cinematic images and videos",body:"Our goal is to generate website media from the actual CUPOLA 3D engine. A render timestamp certifies when the image was produced, not when its satellite imagery was acquired. Camera-motion films are visualizations; observed time-lapses require archived real source frames."}
];
export default function Methodology(){return <EditorialPage eyebrow="CUPOLA / SCIENTIFIC INTEGRITY" title="What we show. And what we don't." intro="A cinematic Earth can be visually convincing without being a current full-planet photograph. CUPOLA makes the difference between visualization and observation explicit.">
 {sections.map((s,i)=><section className="ae-editorial-panel" key={s.title}><p className="ae-kicker">METHODOLOGY / {String(i+1).padStart(2,"0")}</p><h2>{s.title}</h2><p>{s.body}</p></section>)}
 <p style={{color:"#9bb5c7"}}>For provider links and instrument limitations, visit the <Link href="/data-sources" style={{color:"#99deff"}}>Data Sources directory →</Link>.</p>
 <ExploreCallout body="Explore the actual model and inspect its source-health interface. Methodology is intended to make the scene more understandable, not substitute it."/>
 </EditorialPage>}
