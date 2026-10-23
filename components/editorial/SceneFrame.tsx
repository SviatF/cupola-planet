import Link from "next/link";
import {ArrowUpRight, Aperture, Film} from "lucide-react";
import manifest from "@/data/editorial/scene-assets.json";
type SceneAsset={id:string;approved:true;origin:"CUPOLA_CAPTURE_ENGINE";url:string;alt:string;
 manifestUrl:string;renderedAt:string;sourceObservedAt:string|null;sceneRevision:string};
const assets=manifest as {schemaVersion:number;assets:SceneAsset[]};
export function SceneVisual({id,variant="card",label}:{
  id:string;variant?:"hero"|"card"|"wide"|"small";label?:string;
}){
 // Fail closed: a beautiful image without a reviewed source/camera manifest
 // never becomes a CUPOLA article illustration.
 const asset=assets.assets.find(a=>a.id===id && a.approved===true &&
   a.origin==="CUPOLA_CAPTURE_ENGINE" && a.sceneRevision &&
   Number.isFinite(Date.parse(a.renderedAt)) &&
   (a.url.startsWith("/scene-captures/") ||
     a.url.startsWith("https://media.cupola.earth/")));
 return <div className={"ae-scene-image ae-scene-"+variant}>
   {asset?<><img src={asset.url} alt={asset.alt} loading={variant==="hero"?"eager":"lazy"}/>
     <span className="ae-image-provenance">CUPOLA SCENE · {new Date(asset.renderedAt).toISOString().slice(0,16).replace("T"," ")} UTC</span>
   </>:<div className="ae-scene-fallback" role="img" aria-label="CUPOLA scene capture not yet approved">
    <div className="ae-fallback-orbit"/><Aperture size={29}/><span>CUPOLA° / SCENE ASSET PENDING</span>
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
   <iframe title="CUPOLA Earth 3D scene preview" src="/explore?embed=1" loading="eager" tabIndex={-1} aria-hidden="true"/>
   <div className="ae-hero-shade" />
   <span className="ae-render-badge"><span className="ae-pulse"/> RENDERED BY CUPOLA · MIXED OBSERVATION / MODEL</span>
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
