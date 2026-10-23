import type {Metadata} from "next";
import Link from "next/link";
import {MapPin,ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
import {SceneVisual} from "@/components/editorial/SceneFrame";
import registry from "@/data/seo/city-page-candidates.json";
export const metadata:Metadata={title:"Cities from Space — Explore Earth by Location | CUPOLA",description:"Explore Earth from orbit by location. CUPOLA is preparing scientifically labelled city views with computed daylight, documented cloud coverage, camera perspective and original 3D imagery.",alternates:{canonical:"/earth/cities"},robots:{index:false,follow:true}};
export default function CitiesHub(){return <EditorialPage eyebrow="CUPOLA / CITY FROM ORBIT" title="Your city. Another perspective." intro="Each city view will begin with verified geographic coordinates, a repeatable camera view and one source-labelled CUPOLA image. Observed weather will never be confused with historical surface imagery.">
 <section className="ae-editorial-panel"><SceneVisual id="cities-hero" variant="hero" label="ORIGINAL ORBITAL IMAGE / PREPARATION"/><h2>Designed for place-specific understanding</h2><p>Aerial photography of individual city blocks is not available in our global Earth renderer. City reports will present a scientifically honest orbital/regional perspective: location on the globe, solar illumination, observed cloud footprint where available and relevant nearby verified events.</p></section>
 <h2 className="ae-editorial-title" style={{fontSize:32}}>Curated locations in preparation</h2>
 <div className="ae-content-grid">{registry.cities.map(city=><div className="ae-editorial-panel" key={city.country+city.slug}><MapPin color="#80cdf5"/><h2>{city.name}</h2><p>Earth view · {city.country.toUpperCase()} · Geographic validation and capture QA pending.</p><small style={{color:"#81a2ba"}}>Unpublished — not indexed</small></div>)}</div>
 <ExploreCallout title="Find a place in the full scene" body="The 3D viewer supports real geographic navigation. Curated SEO pages will open only after their own facts and assets have passed quality review."/>
 </EditorialPage>}
