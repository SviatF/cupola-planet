import Link from "next/link";
import {ArrowRight,ArrowUpRight,ShieldCheck} from "lucide-react";

/** Source-labelled NASA historical archive; never described as live scene media. */
export const featuredArchive = [
  {
    id:"amazon-understory",
    category:"LAND / FIRE",
    title:"When the forest burns beneath the canopy",
    summary:"A Landsat view reveals why thermal and infrared evidence can tell a different story from what ordinary colour images show.",
    lesson:"A hotspot is not a mapped fire perimeter.",
    image:"https://science.nasa.gov/wp-content/uploads/2025/10/understoryfires763_oli2_2023284.jpg?w=960",
    alt:"NASA Landsat false-colour view of Amazon forest and understory fire features along winding rivers.",
    source:"NASA Earth Observatory",
    acquired:"2023 ARCHIVE",
    imageCredit:"NASA Earth Observatory / Landsat",
    sourceUrl:"https://science.nasa.gov/earth/earth-observatory/drought-fuels-wildfires-in-the-amazon-151965/",
    href:"/learn#amazon-understory"
  },
  {
    id:"greenland-melt",
    category:"ICE / CLIMATE",
    title:"The blue geometry of Greenland's melt season",
    summary:"Landsat 9 recorded melt ponds on the ice sheet. Their size, location and drainage matter more than the colour alone.",
    lesson:"One image cannot measure annual ice loss.",
    image:"https://science.nasa.gov/wp-content/uploads/2025/10/meltponds_oli2_20250702.jpg?w=960",
    alt:"July 2025 NASA Landsat 9 satellite image with blue meltwater ponds on the white western Greenland Ice Sheet.",
    source:"NASA Earth Observatory",
    acquired:"02 JUL 2025",
    imageCredit:"NASA Earth Observatory / USGS Landsat 9 OLI-2",
    sourceUrl:"https://science.nasa.gov/earth/earth-observatory/greenlands-bejeweled-ice-sheet-154534/",
    href:"/learn#greenland-melt"
  },
  {
    id:"lights-at-night",
    category:"HUMAN PRESENCE / NIGHT",
    title:"What the lights of Earth can — and cannot — reveal",
    summary:"From orbit, illuminated cities become a network of bright lines. But light is not a direct measure of population.",
    lesson:"ISS photography and VIIRS radiance are different data.",
    image:"https://assets.science.nasa.gov/dynamicimage/assets/science/esd/climate/2023/12/main_image-83.jpg",
    alt:"NASA archival photograph of city lights across Europe at night beneath the curved atmospheric horizon.",
    source:"NASA imagery",
    acquired:"ISS ARCHIVE",
    imageCredit:"NASA archival Earth-at-night photograph",
    sourceUrl:"https://science.nasa.gov/earth/ai-open-science-climate-change/",
    href:"/earth/night-lights"
  }
] as const;


export function FeaturedAtlas(){
 const [lead,...secondary]=featuredArchive;
 return <section className="ae26-stories" aria-labelledby="ae-featured-title">
   <header className="ae26-section-head">
     <div><p className="ae-section-kicker">01 / SELECTED OBSERVATIONS</p><h2 id="ae-featured-title">A closer look at Earth.</h2><p>Actual imagery. Its context. Its limits.</p></div>
     <Link href="/learn" className="ae26-small-link">All field notes <ArrowRight size={14}/></Link>
   </header>
   <div className="ae26-story-layout">
     <article className="ae26-cover-story">
       <img src={lead.image} alt={lead.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"/>
       <div className="ae26-image-tint"/>
       <div className="ae26-cover-copy">
         <span>{lead.category} <i>·</i> NASA ARCHIVE / {lead.acquired}</span>
         <h3><Link href={lead.href}>{lead.title}</Link></h3>
         <p>{lead.summary}</p>
         <div><Link href={lead.href}>Read the field note <ArrowUpRight size={15}/></Link><a href={lead.sourceUrl} rel="noopener noreferrer" target="_blank">Original NASA source <ArrowUpRight size={13}/></a></div>
       </div>
     </article>
     <div className="ae26-secondary-stories">
       {secondary.map(item=><article key={item.id} className="ae26-secondary-story">
         <Link href={item.href} className="ae26-story-thumb"><img src={item.image} alt={item.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"/></Link>
         <div><span>{item.category} · {item.acquired}</span><h3><Link href={item.href}>{item.title}</Link></h3><p>{item.lesson}</p>
          <a href={item.sourceUrl} rel="noopener noreferrer" target="_blank">NASA source <ArrowUpRight size={12}/></a></div>
       </article>)}
       <Link className="ae26-stories-discover" href="/earth/day-and-night">Explore the science of sunrise <ArrowUpRight size={16}/></Link>
     </div>
   </div>
   <p className="ae26-source-disclosure"><ShieldCheck size={13}/> Images are dated NASA archive, not today's planetary conditions. Original CUPOLA 3D imagery is identified separately. <Link href="/methodology">Our methodology <ArrowUpRight size={12}/></Link></p>
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
