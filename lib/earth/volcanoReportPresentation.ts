/**
 * Display classification of volcano advisory reports, NOT eruption status.
 * A recent NASA EONET or GDACS/VAAC report is not evidence of lava, ash,
 * an ongoing eruption, plume altitude or live thermal radiance.
 */
export function volcanoReportPresentation(
  dataStatus:"recent-report"|"historical-report"|undefined,
  eventTime:string|null|undefined,
  nowMs=Date.now()
):{recentReport:boolean;ageHours:number|null;strength:number}{
  const time=typeof eventTime==="string" ? Date.parse(eventTime):NaN;
  const ageHours=Number.isFinite(time)&&Number.isFinite(nowMs)
    ?(nowMs-time)/3600000:null;
  const recentReport=dataStatus==="recent-report"&&ageHours!==null&&
    ageHours>=-5/60&&ageHours<=48;
  return {
    recentReport,
    ageHours,
    strength:recentReport && ageHours!==null
      ?0.62+0.38*Math.max(0,1-Math.max(0,ageHours)/48)
      :0.22
  };
}
