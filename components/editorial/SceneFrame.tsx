import Link from "next/link";
import {ArrowUpRight, Aperture, Film, Globe2} from "lucide-react";
import manifest from "@/data/editorial/scene-assets.json";
type SceneAsset={id:string;approved:true;origin:"CUPOLA_CAPTURE_ENGINE";url:string;alt:string; videoUrl?:string;
 manifestUrl:string;renderedAt:string;sourceObservedAt:string|null;sceneRevision:string};
const assets=manifest as {schemaVersion:number;assets:SceneAsset[]};
export function getApprovedSceneAsset(id:string){
 const asset=assets.assets.find(a=>a.id===id && a.approved===true &&
   a.origin==="CUPOLA_CAPTURE_ENGINE" && /^[a-f0-9]{40,64}$/.test(a.sceneRevision) &&
   Number.isFinite(Date.parse(a.renderedAt)) &&
   (a.url.startsWith("/scene-captures/") || a.url.startsWith("https://media.cupola.earth/")));
 return asset ?? null;
}
const scienceFrames:Record<string,{eyebrow:string;title:string;detail:string}>={
 "earth-observatory-cover":{eyebrow:"THE EARTH OBSERVATORY",title:"One Earth. Different instruments.",detail:"Our own orbital still will appear here after cloud-coverage and acquisition-time review."},
 "clouds-hero":{eyebrow:"CLOUD SCIENCE",title:"No cloud image sees every ocean.",detail:"Geostationary footprints, model gaps and latency are all part of the weather story."},
 "day-night-hero":{eyebrow:"SOLAR GEOMETRY",title:"Dawn moves across a turning planet.",detail:"The terminator is calculated, not photographed by a continuous global camera."},
 "night-lights-hero":{eyebrow:"NIGHT RADIANCE",title:"Light is a measurement, not a population.",detail:"VIIRS and historic composites tell different kinds of stories about Earth after dark."},
 "cities-hero":{eyebrow:"PLACES FROM ORBIT",title:"A coordinate is the beginning of a story.",detail:"Every city needs a checked geographic position and a source-labelled original view."},
 "satellite-atlas-hero":{eyebrow:"OBJECTS IN ORBIT",title:"Their paths are computed, not guessed.",detail:"Orbital element epochs and SGP4 estimates are kept separate from direct telemetry."}
};

export function SceneVisual({id,variant="card",label}:{
  id:string;variant?:"hero"|"card"|"wide"|"small";label?:string;
}){
 // Fail closed: a beautiful image without a reviewed source/camera manifest
 // never becomes a CUPOLA article illustration.
 const asset=getApprovedSceneAsset(id);
 const context=scienceFrames[id]??{eyebrow:"ORIGINAL CUPOLA SCENE",title:"The Earth is not a stock photograph.",detail:"An original 3D frame is reserved for this story after science and editorial review."};
 return <div className={"ae-scene-image ae-scene-"+variant}>
   {asset?<><img src={asset.url} alt={asset.alt} loading={variant==="hero"?"eager":"lazy"}/>
     <span className="ae-image-provenance">CUPOLA SCENE · {new Date(asset.renderedAt).toISOString().slice(0,16).replace("T"," ")} UTC</span>
   </>:<div className="ae-scene-fallback" role="note" aria-label="Original CUPOLA media awaiting science and editorial review">
    <span className="ae-fallback-eyebrow">{context.eyebrow}</span>
    <span className="ae-fallback-headline">{context.title}</span>
    <span className="ae-fallback-description">{context.detail}</span>
   </div>}
   {label&&<span className="ae-image-label">{label}</span>}
 </div>;
}
/** Embeds the *actual* existing CUPOLA WebGL scene instead of a fictional
 * photograph or external stock art. The video/media capture job will replace
 * the expensive iframe with an approved WebP once a renderer is validated.
 */
export function LiveHeroScene(){
 return <div className="ae-live-scene" aria-label="CUPOLA interactive render preview">
   <iframe title="CUPOLA Earth 3D scene preview" src="/explore?embed=1&hero=sunrise" loading="eager" tabIndex={-1} aria-hidden="true"/>
   <div className="ae-hero-shade" />
   <span className="ae-render-badge"><span className="ae-pulse"/> REAL SUN DIRECTION · CUPOLA 3D VISUALIZATION</span>
 </div>;
}
export function CinematicFeature({title,description,id,href,label}:{
 title:string;description:string;id:string;href:string;label:string;
}){
 return <Link href={href} className="ae-feature-card">
    <SceneVisual id={id} variant="card" label={label}/>
    <span className="ae-feature-copy"><span className="ae-card-kicker">{label}</span><strong>{title}</strong><small>{description}</small><span className="ae-circle-arrow"><ArrowUpRight size={17}/></span></span>
  </Link>;
}
export function WatchUnavailable(){
 return <div className="ae-watch-note"><Film size={21}/><div><strong>Scene films are being prepared</strong><p>Only rendered, source-labelled CUPOLA footage will be published here. Motion graphics will be labelled separately from observed satellite imagery.</p></div><Link href="/explore">Explore the live scene <ArrowUpRight size={15}/></Link></div>;
}

/** The WATCH strip is activated only when a real, science-approved WebM exists.
 * No placeholder play buttons or fictional 8-second films.
 */
export function OriginalSceneFilm({id="home-hero"}:{id?:string}){
 const asset=getApprovedSceneAsset(id);
 const film=asset?.videoUrl;
 const valid=film && (film.startsWith("/scene-captures/")||
   film.startsWith("https://media.cupola.earth/")) &&
   film.endsWith(".webm");
 if(!valid||!asset)return <div className="ae-films-editorial">
   <div className="ae-films-main"><p className="ae-section-kicker">THE OBSERVATORY / ORIGINAL MOTION</p>
    <h3>Every frame begins with the planet.</h3><p>We capture directly from CUPOLA's Earth renderer. Footage is published only after camera, texture and source-age review — never as an invented live satellite film.</p></div>
   <div className="ae-films-links"><Link href="/explore"><Globe2 size={17}/> Enter the real-time 3D observatory <ArrowUpRight size={16}/></Link><Link href="/methodology">How original scene media is verified <ArrowUpRight size={15}/></Link></div>
 </div>;
 return <figure className="ae-original-film"><video controls preload="none" poster={asset.url} aria-label={asset.alt}>
   <source src={film} type="video/webm"/>Your browser does not support WebM.</video>
   <figcaption>CUPOLA ORIGINAL SCENE · 3D VISUALIZATION, NOT SATELLITE FOOTAGE · Captured {new Date(asset.renderedAt).toISOString().slice(0,16).replace("T"," ")} UTC · <Link href="/methodology">Provenance</Link></figcaption>
 </figure>;
}
