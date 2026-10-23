import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {absoluteUrl} from "@/lib/seo/site";
import {approvedDailyReports,dailyReportByDay,dailyReportPath} from "@/lib/editorial/publishedDaily";

export const dynamicParams=false;
type Props={params:Promise<{date:string}>};
export function generateStaticParams(){
  return approvedDailyReports.map(report=>({date:report.day}));
}
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {date}=await params;
  const report=dailyReportByDay(date);
  if(!report)return {title:"Report not available | CUPOLA",robots:{index:false}};
  const title="Earth on "+new Date(date+"T12:00:00Z").toLocaleDateString("en-US",
    {timeZone:"UTC",month:"long",day:"numeric",year:"numeric"})+" | CUPOLA";
  const description="Verified Earth observations, official advisories, model context and sources for "+
    date+". Reviewed by CUPOLA editors; selected facts, not a complete global census.";
  return {title,description,alternates:{canonical:dailyReportPath(date)},
    openGraph:{type:"article",title,description,url:dailyReportPath(date),
      images:[{url:report.media.hero.url,alt:report.media.hero.alt}]}};
}
const showUTC=(time:string)=>new Date(time).toISOString().slice(0,16).replace("T"," ")+" UTC";
export default async function DailyEarthPage({params}:Props){
  const {date}=await params;
  const report=dailyReportByDay(date);
  if(!report)notFound();
  const {ledger,editorial,media,approvedBy}=report;
  const comments=new Map(editorial.narrative.highlights.map(h=>[h.factId,h.commentary]));
  const title="Earth on "+new Date(date+"T12:00:00Z").toLocaleDateString("en-US",
    {timeZone:"UTC",month:"long",day:"numeric",year:"numeric"});
  const structured={
    "@context":"https://schema.org","@type":"Article",headline:title,
    mainEntityOfPage:absoluteUrl(dailyReportPath(date)),
    datePublished:approvedBy.publishedAt,
    dateModified:approvedBy.updatedAt||approvedBy.publishedAt,
    author:{"@type":"Organization",name:"CUPOLA Earth Observatory"},
    publisher:{"@type":"Organization",name:"CUPOLA"},
    isAccessibleForFree:true,image:media.hero.url,
    description:ledger.coverageNote
  };
  return <main className="daily-report">
    <script type="application/ld+json"
      dangerouslySetInnerHTML={{__html:JSON.stringify(structured).replace(/</g,"\\u003c")}}/>
    <header className="daily-topbar">
      <Link className="daily-logo" href="/">CUPOLA°</Link>
      <nav aria-label="Explore CUPOLA"><Link href="/">Explore 3D Earth</Link><Link href="/satellites">Satellites</Link></nav>
    </header>
    <article className="daily-container">
      <p className="daily-kicker">CUPOLA / VERIFIED EARTH REPORT / UTC</p>
      <h1>{title}</h1>
      <p className="daily-summary">{editorial.narrative.intro}</p>
      <div className="daily-dates">
        <span>Published: <time dateTime={approvedBy.publishedAt}>{showUTC(approvedBy.publishedAt)}</time></span>
        <span>Reporting day: <time dateTime={date}>{date}</time> · UTC</span>
        <span>Independent sources: {ledger.sources.length}</span>
      </div>
      <figure className="daily-hero">
        <img src={media.hero.url} alt={media.hero.alt} width="1600" height="900" loading="eager"/>
        <figcaption>CUPOLA scene visualization generated {showUTC(media.hero.renderedAt)}.
          Underlying source observation: {media.hero.sourceObservedAt?showUTC(media.hero.sourceObservedAt):"not verified"}.
          This visualization is not a real-time camera photograph of the entire Earth.
          <a href={media.hero.captureManifestUrl} target="_blank" rel="noopener noreferrer"> Capture provenance ↗</a>
        </figcaption>
      </figure>
      <section aria-labelledby="selected-heading">
        <h2 id="selected-heading">Selected verified observations and advisories</h2>
        <p className="daily-disclaimer">{ledger.coverageNote} Event time is different from feed retrieval time;
          advisories and forecasts are not instrument measurements.</p>
        <div className="daily-events">
          {ledger.facts.map(f=><section className="daily-event" key={f.id}>
            <div className="daily-event-head">
              <span>{f.kind.replaceAll("-"," ").toUpperCase()} · {f.dataMode.toUpperCase()}</span>
              <time dateTime={f.occurredAt}>{showUTC(f.occurredAt)}</time>
            </div>
            <h3>{f.headline}</h3>
            <p>{f.explanation}</p>
            {comments.has(f.id)&&<p className="daily-commentary">{comments.get(f.id)}</p>}
            <a href={f.sourceUrl} rel="noopener noreferrer" target="_blank">Original evidence ↗</a>
          </section>)}
        </div>
      </section>
      <section aria-labelledby="provenance-heading" className="daily-provenance">
        <h2 id="provenance-heading">Data sources, delays and geographic limitations</h2>
        {ledger.sources.map(s=><div className="daily-source" key={s.id}>
          <h3>{s.name}</h3><p>{s.coverage}</p>
          <p><strong>Source as-of:</strong> <time dateTime={s.asOf}>{showUTC(s.asOf)}</time>
            {" · "}Ingestion age at compilation: {s.lagMinutes} minutes
            {" · "}Data classification: {s.mode}</p>
          {s.limitations&&<p>{s.limitations}</p>}
          <a href={s.url} rel="noopener noreferrer" target="_blank">Provider ↗</a>
        </div>)}
        {ledger.unavailableSources.length>0&&<p className="daily-disclaimer">Feeds without eligible verified source data:
          {" "}{ledger.unavailableSources.join(", ")}. This is not evidence that no events occurred.</p>}
        <p className="daily-disclaimer">Fact snapshot SHA-256: <code>{ledger.digest}</code></p>
        <p>Editor: {approvedBy.editor} · Scientific reviewer: {approvedBy.scienceReviewer}</p>
      </section>
      <footer className="daily-footer"><Link href="/">Explore the interactive Earth →</Link><Link href="/satellites">Satellite Atlas →</Link></footer>
    </article>
  </main>;
}
