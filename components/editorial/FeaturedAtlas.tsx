import Link from "next/link";
import {ArrowRight,ArrowUpRight,ShieldCheck} from "lucide-react";
import {getApprovedSceneAsset} from "@/components/editorial/SceneFrame";

/**
 * Original NASA case studies are retained only as SCIENTIFIC READING references.
 * Their archival images are not displayed by CUPOLA. They cannot be reproduced
 * honestly from a modern mixed-age global 3D render as if it were Landsat 2023.
 */
export const featuredArchive = [
 {
  id:"amazon-understory",category:"LAND / FIRE",
  title:"When the forest burns beneath the canopy",
  summary:"A Landsat view reveals why thermal and infrared evidence can tell a different story from ordinary colour images.",
  lesson:"A hotspot is not a mapped fire perimeter.",acquired:"2023 ARCHIVE",
  source:"NASA Earth Observatory",
  sourceUrl:"https://science.nasa.gov/earth/earth-observatory/drought-fuels-wildfires-in-the-amazon-151965/",
  href:"/learn#amazon-understory"
 },
 {
  id:"greenland-melt",category:"ICE / CLIMATE",
  title:"The blue geometry of Greenland's melt season",
  summary:"Landsat 9 recorded melt ponds on the ice sheet. Seasonal change needs repeat observations.",
  lesson:"One image cannot measure annual ice loss.",acquired:"02 JUL 2025",
  source:"NASA Earth Observatory",
  sourceUrl:"https://science.nasa.gov/earth/earth-observatory/greenlands-bejeweled-ice-sheet-154534/",
  href:"/learn#greenland-melt"
 },
 {
  id:"lights-at-night",category:"HUMAN PRESENCE / NIGHT",
  title:"What the lights of Earth can — and cannot — reveal",
  summary:"City lights are informative but are not a direct measurement of population.",
  lesson:"ISS photography and VIIRS radiance are different data.",acquired:"ISS ARCHIVE",
  source:"NASA science archive",
  sourceUrl:"https://science.nasa.gov/earth/ai-open-science-climate-change/",
  href:"/learn#lights-at-night"
 }
] as const;

const featuredOriginal=[
 {
  id:"clouds-hero",category:"ATMOSPHERE / OBSERVED + MODEL",
  title:"The clouds surrounding our planet",
  summary:"See CUPOLA's own Earth renderer. Instrument coverage and model-filled gaps have different origins and observation times.",
  href:"/earth/clouds",
  provenance:"Regional cloud sources, rendered in one 3D scene",
  index:"01"
 },
 {
  id:"day-night-hero",category:"ASTRONOMY / COMPUTED",
  title:"The moving line between day and night",
  summary:"Calculated from the Sun–Earth geometry, not a live global photograph.",
  href:"/earth/day-and-night",
  provenance:"UTC solar geometry",
  index:"02"
 },
 {
  id:"night-lights-hero",category:"NIGHT RADIANCE / MIXED AGE",
  title:"Earth's illuminated cities",
  summary:"Night-light layers need a source date. Older composites are not today's electricity map.",
  href:"/earth/night-lights",
  provenance:"VIIRS or historical radiance, source labelled",
  index:"03"
 }
] as const;

/**
 * This cover NEVER falls back to web photos or generic stock art.
 * Before the first approved capture it is a deliberate text-only feature;
 * after approval the same layout automatically reveals original WebP frames.
 */
export function FeaturedAtlas(){
 const [lead,...secondary]=featuredOriginal;
 const leadMedia=getApprovedSceneAsset(lead.id);
 return <section className="ae26-stories ae28-original-stories" aria-labelledby="ae-featured-title">
  <header className="ae26-section-head">
   <div><p className="ae-section-kicker">01 / THE CUPOLA OBSERVATORY</p>
    <h2 id="ae-featured-title">Earth, through our own lens.</h2>
    <p>Original 3D scene captures, grounded in scientific sources — never borrowed editorial photography.</p></div>
   <Link href="/earth" className="ae26-small-link">Explore Earth science <ArrowRight size={14}/></Link>
  </header>
  <div className="ae28-stories-grid">
   <article className={"ae28-cover"+(!leadMedia?" ae28-cover-text-only":"")}>
    {leadMedia&&<img src={leadMedia.url} alt={leadMedia.alt} loading="lazy" decoding="async"/>}
    <div className="ae28-cover-overlay"/>
    <div className="ae28-cover-copy"><span className="ae-section-kicker">{lead.category}</span>
     <h3><Link href={lead.href}>{lead.title}</Link></h3>
     <p>{lead.summary}</p>
     <Link href={lead.href} className="ae28-read">Understand the scene <ArrowUpRight size={15}/></Link>
    </div>
    {leadMedia&&<span className="ae28-capture-label">CUPOLA ORIGINAL 3D RENDER · NOT SATELLITE PHOTOGRAPHY</span>}
   </article>
   <div className="ae28-story-rail">{secondary.map(item=>{
    const media=getApprovedSceneAsset(item.id);
    return <article className="ae28-story-row" key={item.id}>
     {media&&<Link href={item.href} className="ae28-story-visual"><img src={media.url} alt={media.alt} loading="lazy" decoding="async"/></Link>}
     <div><span className="ae28-story-kicker">{item.index} / {item.category}</span>
      <h3><Link href={item.href}>{item.title}</Link></h3>
      <p>{item.summary}</p>
      <Link href={item.href}>Read the evidence <ArrowUpRight size={13}/></Link>
     </div>
    </article>})}</div>
  </div>
  <p className="ae26-source-disclosure"><ShieldCheck size={13}/>
   CUPOLA frames illustrate computed and mixed-age observations; they are not continuously photographed live Earth. <Link href="/data-sources">Source methodology <ArrowUpRight size={12}/></Link>
  </p>
 </section>;
}

const fieldNotes=[
 {no:"01",label:"CLOUD COVERAGE",title:"What satellites cannot see",detail:"Footprints and acquisition times matter.",href:"/earth/clouds"},
 {no:"02",label:"SOLAR GEOMETRY",title:"Where night begins",detail:"A calculated boundary, not a live photograph.",href:"/earth/day-and-night"},
 {no:"03",label:"NIGHT RADIANCE",title:"Reading the lights below",detail:"Brightness alone cannot measure population.",href:"/earth/night-lights"}
] as const;
export function FieldNotes(){return <section className="ae26-fieldnotes" aria-labelledby="ae-field-heading">
 <header className="ae26-section-head"><div><p className="ae-section-kicker">03 / FIELD NOTES</p><h2 id="ae-field-heading">Understand what you see.</h2><p>Short guides to the instruments and calculations behind CUPOLA.</p></div><Link href="/methodology" className="ae26-small-link">Methodology <ArrowRight size={14}/></Link></header>
 <div className="ae26-notes-grid">{fieldNotes.map(n=><Link href={n.href} className="ae26-note" key={n.no}>
   <span>{n.no} / {n.label}</span><h3>{n.title}</h3><p>{n.detail}</p><ArrowUpRight size={16}/></Link>)}</div>
 </section>}
