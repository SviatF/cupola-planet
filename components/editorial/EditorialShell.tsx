import "@/app/atlas.css";
import Link from "next/link";
import {ArrowUpRight, Globe2, Radio, Search, Satellite, Layers3, BookOpen, Menu} from "lucide-react";
import type {ReactNode} from "react";
const navigation=[
  {href:"/earth",title:"Earth"},
  {href:"/earth/cities",title:"Cities"},
  {href:"/earth/daily",title:"Daily Reports"},
  {href:"/satellites",title:"Satellites"},
  {href:"/events",title:"Events"},
  {href:"/learn",title:"Learn"},
  {href:"/methodology",title:"Methodology"},
];
export function EditorialHeader(){
  return <header className="ae-header">
    <Link className="ae-logo" href="/" aria-label="CUPOLA home"><span className="ae-logo-ring"/>CUPOLA<span className="ae-mark">°</span></Link>
    <nav aria-label="Primary navigation" className="ae-nav">{navigation.map(l=><Link key={l.href} href={l.href}>{l.title}</Link>)}</nav>
    <div className="ae-header-actions">
      <Link href="/earth/cities" className="ae-icon-button" aria-label="Browse places"><Search size={18}/></Link>
      <Link href="/explore" className="ae-start"><Globe2 size={15}/> Open Earth <ArrowUpRight size={15}/></Link>
    </div>
    <details className="ae-mobile-nav"><summary aria-label="Open site navigation"><Menu size={21}/></summary><nav>{navigation.map(l=><Link href={l.href} key={l.href}>{l.title}</Link>)}<Link href="/explore">Open 3D Earth ↗</Link></nav></details>
  </header>;
}
export function EditorialFooter(){
  return <footer className="ae-footer"><div className="ae-footer-top"><div><Link href="/" className="ae-logo"><span className="ae-logo-ring"/>CUPOLA<span className="ae-mark">°</span></Link><p>Earth observations. Orbital mathematics. A clearer view of our changing planet.</p></div><nav aria-label="Footer navigation"><Link href="/explore">Explore 3D Earth</Link><Link href="/satellites">Satellite Atlas</Link><Link href="/earth/daily">Daily reports</Link><Link href="/data-sources">Sources</Link><Link href="/methodology">Methodology</Link></nav></div><div className="ae-footer-bottom"><span>© CUPOLA Earth Observatory</span><span>Observations ≠ predictions ≠ cinematic visualizations</span></div></footer>;
}
export function Eyebrow({children}:{children:ReactNode}){return <p className="ae-eyebrow"><span className="ae-pulse"/> {children}</p>}
export function EditorialPage({eyebrow,title,intro,children}:{eyebrow:string;title:string;intro:string;children:ReactNode}){
  return <div className="atlas-site"><EditorialHeader/><main className="ae-page-shell"><Eyebrow>{eyebrow}</Eyebrow><h1 className="ae-editorial-title">{title}</h1><p className="ae-page-deck">{intro}</p>{children}</main><EditorialFooter/></div>;
}
export function ExploreCallout({title="The full story lives on the globe",body,href="/explore"}:{title?:string;body:string;href?:string}){
  return <aside className="ae-explore-callout"><div className="ae-orbit-mark"><Globe2 size={38}/></div><div><p className="ae-kicker">EXPLORE THE ORIGINAL SCENE</p><h2>{title}</h2><p>{body}</p></div><Link href={href} className="ae-cta-primary">Open 3D Earth <ArrowUpRight size={17}/></Link></aside>;
}
export function EditorialQuickLinks(){
 return <section className="ae-quicklinks" aria-label="Explore collections"><Link href="/earth"><Radio/> Observations <ArrowUpRight/></Link><Link href="/satellites"><Satellite/> Satellite Atlas <ArrowUpRight/></Link><Link href="/earth/cities"><Layers3/> Cities from Space <ArrowUpRight/></Link><Link href="/learn"><BookOpen/> Learn <ArrowUpRight/></Link></section>;
}
