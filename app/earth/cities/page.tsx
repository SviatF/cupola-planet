import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
import registry from "@/data/seo/city-page-candidates.json";
export const metadata:Metadata={title:"Cities from Space — Explore Earth by Location | CUPOLA",description:"Explore Earth from orbit by location. CUPOLA is preparing scientifically labelled city views with computed daylight, documented cloud coverage, camera perspective and original 3D imagery.",alternates:{canonical:"/earth/cities"},robots:{index:false,follow:true}};
export default function CitiesHub(){return <EditorialPage eyebrow="CUPOLA / PLACES" title="A world of places." intro="A curated directory of locations for future verified orbital perspectives — not fictional street-level satellite photography.">
 <div className="ae26-city-head"><h2>Locations in preparation</h2><p>Coordinates, regional context and original CUPOLA scene captures must pass review before individual pages are published.</p></div>
 <div className="ae26-city-index">{registry.cities.map((city,i)=><div key={city.country+city.slug} className="ae26-city-row"><span>{String(i+1).padStart(2,"0")}</span><strong>{city.name}</strong><small>{city.country.toUpperCase()}</small><em>IN PREPARATION</em></div>)}</div>
 <p className="ae26-evidence-line">These candidates are not indexed as individual city reports. <Link href="/methodology">Why quality comes first <ArrowUpRight size={13}/></Link></p>
 <ExploreCallout title="Find your place on Earth" body="The original 3D globe supports geographic navigation, current solar illumination and source-labelled layers."/>
 </EditorialPage>}