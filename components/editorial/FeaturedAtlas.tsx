import Link from "next/link";
import {ArrowRight, ArrowUpRight, Activity, Globe2, Satellite, ScanEye, ShieldCheck, Compass, CloudSun, SunMoon, Radio} from "lucide-react";

/**
 * CUPOLA editorial selection, not a live news feed.
 * NASA archival images are distinctly credited; no externally hosted image
 * is described as a scene capture or a contemporaneous observation.
 * Real CUPOLA scene images use the separate science-approved SceneVisual gate.
 */
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
    href:"/events"
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
    href:"/learn"
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
 return <section className="ae-featured-journal ae-section" aria-labelledby="ae-featured-title">
   <header className="ae-journal-heading">
     <div className="ae-journal-heading-mark"><ScanEye size={19}/></div>
     <div className="ae-journal-heading-copy">
       <p className="ae-section-kicker">CUPOLA / THE OBSERVATION JOURNAL</p>
       <h2 id="ae-featured-title">Earth, with the evidence attached.</h2>
       <p>Three archival observations. Three ways to read beyond the image.</p>
     </div>
     <Link href="/learn" className="ae-journal-heading-link">Explore the field notes <ArrowRight size={16}/></Link>
   </header>
   <div className="ae-editorial-mosaic">
    {featuredArchive.map(item=><article key={item.id} className="ae-archive-card">
      <img className="ae-archive-photo" src={item.image} alt={item.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"/>
      <div className="ae-archive-scrim" aria-hidden="true"/>
      <div className="ae-archive-topline"><span>{item.category}</span><span>ARCHIVE · {item.acquired}</span></div>
      <div className="ae-archive-bottom">
        <p className="ae-archive-kicker">{item.source} <span aria-hidden="true">/</span> SOURCE-LABELLED</p>
        <h3><Link href={item.href}>{item.title}<span className="ae-stretched-link" aria-hidden="true"/></Link></h3>
        <p className="ae-archive-deck">{item.summary}</p>
        <div className="ae-archive-proof"><ShieldCheck size={13}/><span>{item.lesson}</span></div>
      </div>
      <a className="ae-archive-source" href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Original NASA source for ${item.title}`} title={item.imageCredit}>NASA source <ArrowUpRight size={12}/></a>
    </article>)}
    <aside className="ae-journal-rail" aria-label="Explore scientific perspectives">
      <a className="ae-rail-photo" href="https://science.nasa.gov/earth/earth-observatory/hurricane-milton-crosses-florida-153440/" target="_blank" rel="noopener noreferrer">
        <img src="https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/imagerecords/153000/153440/ISS072-E-29325_lrg.jpg?crop=faces%2Cfocalpoint&fit=crop&h=800&w=1200" alt="Hurricane Milton viewed by an astronaut on October 8, 2024" loading="lazy" decoding="async"/>
        <span className="ae-rail-photo-overlay"><small>NASA / 08 OCT 2024</small><strong>Inside the eye of a storm</strong><span>Historical observation <ArrowUpRight size={12}/></span></span>
      </a>
      <Link className="ae-rail-link" href="/earth/day-and-night">
        <span className="ae-rail-symbol ae-rail-symbol-sun"><SunMoon size={22}/></span>
        <span><small>ASTRONOMY / COMPUTED</small><strong>The moving line of dawn</strong><em>Why sunlight is geometry, not a live photo</em></span>
        <ArrowUpRight size={16}/>
      </Link>
      <Link className="ae-rail-link" href="/satellites">
        <span className="ae-rail-symbol ae-rail-symbol-orbit"><Satellite size={22}/></span>
        <span><small>ORBIT / PREDICTED</small><strong>Tracking objects above us</strong><em>SGP4 estimates versus live telemetry</em></span>
        <ArrowUpRight size={16}/>
      </Link>
    </aside>
   </div>
   <p className="ae-journal-disclosure"><ShieldCheck size={14}/> Featured imagery is an explicitly dated NASA archive, not today's planetary conditions. CUPOLA's own 3D captures are reviewed and labelled separately. <Link href="/methodology">How we distinguish them <ArrowUpRight size={12}/></Link></p>
 </section>;
}

const fieldNotes=[
 {number:"01",icon:CloudSun,kicker:"OBSERVATION",title:"Why one cloud layer cannot see the whole planet",body:"Geostationary instruments view regional footprints. CUPOLA blends sources for context while preserving gaps, delays and forecast distinctions.",href:"/earth/clouds",link:"Read the cloud guide"},
 {number:"02",icon:SunMoon,kicker:"CALCULATION",title:"Where Earth's night begins",body:"The terminator comes from Earth–Sun geometry. The beautiful blue atmospheric edge is a rendering of that physical relationship.",href:"/earth/day-and-night",link:"Understand the terminator"},
 {number:"03",icon:Radio,kicker:"RADIANCE",title:"What city lights really measure",body:"Nighttime radiance comes from light reaching a sensor. Clouds, exposure and composite processing can change what appears on the map.",href:"/earth/night-lights",link:"Explore night-light science"}
] as const;

export function FieldNotes(){
 return <section className="ae-field-notes ae-section" aria-labelledby="ae-field-heading">
   <div className="ae-section-heading"><div><p className="ae-section-kicker">CUPOLA / READ THE SIGNAL</p><h2 id="ae-field-heading">The science behind the spectacle.</h2><p>Original explainers, built around what CUPOLA can verify and calculate.</p></div><Link href="/methodology" className="ae-text-link">Our methodology <ArrowRight size={15}/></Link></div>
   <div className="ae-field-grid">
    {fieldNotes.map((note)=><Link href={note.href} key={note.number} className="ae-field-card">
      <div className="ae-field-top"><span>FIELD NOTE / {note.number}</span><note.icon size={23}/></div>
      <div className="ae-field-visual" aria-hidden="true"><span className="ae-field-arc"/><span className="ae-field-node"/></div>
      <div className="ae-field-text"><p>{note.kicker}</p><h3>{note.title}</h3><small>{note.body}</small><span className="ae-field-cta">{note.link}<ArrowUpRight size={14}/></span></div>
    </Link>)}
   </div>
 </section>;
}
