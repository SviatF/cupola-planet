/** NASA GIBS imagery is daily acquisition imagery; NEVER streaming Earth video.
 * Satellite scene snapshots may contain clouds/no-data. Gap-filled BRDF
 * nighttime radiance can reuse earlier pixel retrievals.
 */
export type DailyImageryKind="night"|"surface";
export type DailyImageryInfo={
  kind:DailyImageryKind;
  status:"daily-satellite"|"not-available";
  source:string;
  layer:string;
  imageryDate:string;
  verifiedPixelTime:false;
  latestPixelObservationUnknown:true;
  gapFilled:boolean;
};

export function parseDailyImageryInfo(
  input:unknown, kind:DailyImageryKind, now=Date.now(),
):DailyImageryInfo|null{
  if(!input||typeof input!=="object")return null;
  const a=input as Partial<DailyImageryInfo>;
  if(a.kind!==kind||a.status!=="daily-satellite"||
    typeof a.source!=="string"||typeof a.layer!=="string"||
    typeof a.imageryDate!=="string"||a.verifiedPixelTime!==false||
    a.latestPixelObservationUnknown!==true||typeof a.gapFilled!=="boolean")return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a.imageryDate))return null;
  const ms=Date.parse(a.imageryDate+"T00:00:00Z");
  // Day metadata indicates the requested daily layer, not individual granule UTC.
  const today=new Date(now).toISOString().slice(0,10);
  const ageDays=Math.round((Date.parse(today+"T00:00:00Z")-ms)/86400_000);
  if(!Number.isFinite(ms)||ageDays<0||ageDays>(kind==="night"?4:6))return null;
  const acceptable=kind==="night"?
    /^VIIRS_(?:NOAA21|NOAA20|SNPP)_GapFilled_BRDF_Corrected_DayNightBand_Radiance$/.test(a.layer)
    :/^VIIRS_(?:NOAA21|NOAA20|SNPP)_CorrectedReflectance_TrueColor$/.test(a.layer);
  if(!acceptable||a.source!=="NASA GIBS / VIIRS")return null;
  if(a.gapFilled!==(kind==="night"))return null;
  return a as DailyImageryInfo;
}
export function imageVersion(info:DailyImageryInfo):string{
  return info.layer+"@"+info.imageryDate;
}
