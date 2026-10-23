import stored from "@/data/editorial/published.json";

export type DailyFact = {
  id:string;kind:string;source:string;occurredAt:string;headline:string;explanation:string;
  sourceUrl:string;dataMode:string;latitude?:number;longitude?:number;
  measurements:Record<string,number|null>;
};
export type DailySource = {
  id:string;name:string;url:string;coverage:string;asOf:string;lagMinutes:number;
  mode:string;verifiedSelectedFacts:number;limitations?:string;forecastValidAt?:string;
};
export type ApprovedDaily = {
  day:string;indexApproved:true;pageStatus:"PUBLISHED";
  approvedBy:{editor:string;scienceReviewer:string;approvedAt:string;publishedAt:string;updatedAt?:string};
  media:{hero:{url:string;alt:string;renderedAt:string;sourceObservedAt:string|null;sceneRevision:string;captureManifestUrl:string}};
  ledger:{day:string;digest:string;facts:DailyFact[];sources:DailySource[];
    unavailableSources:string[];coverageNote:string;};
  editorial:{narrative:{intro:string;highlights:Array<{factId:string;commentary:string}>}};
};
const registry = stored as unknown as { schemaVersion:number; reports:ApprovedDaily[] };
export const approvedDailyReports:ApprovedDaily[] = registry.reports.filter(report =>
  report.pageStatus==="PUBLISHED" && report.indexApproved===true &&
  report.approvedBy?.editor && report.approvedBy?.scienceReviewer &&
  report.media?.hero?.url && report.ledger?.day===report.day &&
  report.ledger.sources?.length>=2 && report.ledger.facts?.length>=5 &&
  report.editorial?.narrative?.intro
).sort((a,b)=>b.day.localeCompare(a.day));
export const dailyReportPath=(day:string)=>"/earth/daily/"+day;
export const dailyReportByDay=(day:string)=>approvedDailyReports.find(r=>r.day===day);
