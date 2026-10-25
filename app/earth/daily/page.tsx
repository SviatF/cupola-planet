import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
import {approvedDailyReports,dailyReportPath} from "@/lib/editorial/publishedDaily";
export const metadata:Metadata={title:"Daily Earth Reports — Verified Observation Journal | CUPOLA",description:"Explore source-dated Earth observation reports built from USGS, NOAA and other verified data. Reports are published after editorial and scientific review; forecasts are identified separately.",alternates:{canonical:"/earth/daily"},robots:{index:approvedDailyReports.length>0,follow:true}};
export default function DailyReportsHub(){return <EditorialPage eyebrow="CUPOLA / THE EARTH JOURNAL" title="The daily Earth record." intro="A selective scientific journal. Every published report begins with source-dated observations and clearly identified predictions.">
 <div className="ae26-journal-status"><span>PUBLICATION STANDARD</span><p>Original records and measurements are reviewed before publication. An editorial draft is not a verified report.</p></div>
 <section className="ae26-daily-list" aria-label="Reviewed daily Earth reports"><h2>Reviewed reports</h2>{approvedDailyReports.length>0?approvedDailyReports.map(r=><Link key={r.day} className="ae26-daily-entry" href={dailyReportPath(r.day)}><time>{r.day}</time><strong>{r.ledger.facts.length} reviewed source records</strong><ArrowUpRight size={17}/></Link>):<p className="ae26-publishing-empty">No dated reports have completed scientific and editorial approval. We do not publish AI-only breaking stories.</p>}</section>
 <ExploreCallout title="See the Earth between reports" body="Browse current source availability, event markers and calculated astronomy in the interactive Earth view."/>
 </EditorialPage>}