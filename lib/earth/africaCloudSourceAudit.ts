/**
 * Read-only geographic provenance audit for CUPOLA V3. The output is
 * a diagnostic, NOT a request to brighten, paint or reclassify clouds.
 *
 * Native QA-screened Level-2 (G>0) has absolute priority, even if R=0
 * means observed clear sky. B=232 is visual-only NOAA longwave infrared;
 * B=224/248 is styled EUMETView CLM; B=255 is NOAA GFS forecast.
 * No source is upgraded to observed L2 by this analysis.
 */
export type CloudAuditSector = {
  key: "africa" | "atlantic" | "indian-ocean" | "southern-ocean";
  bbox: [number, number, number, number];
};
export const CLOUD_AUDIT_SECTORS: readonly CloudAuditSector[] = [
  { key: "africa", bbox: [-18, -35, 50, 37] },
  { key: "atlantic", bbox: [-65, -35, -18, 37] },
  { key: "indian-ocean", bbox: [50, -35, 90, 37] },
  { key: "southern-ocean", bbox: [-18, -70, 50, -35] },
];
export type CloudSectorAudit = {
  sector: string;
  pixels: number;
  nativeLevel2: number;
  nativeLevel2Clear: number;
  styledMeteosat: number;
  noaaIrVisual: number;
  modelGfs: number;
  noData: number;
  visuallyDark: number;
  greyDetail: number;
  brightCloud: number;
  noaaSourceValid: number;
  noaaSourceDark: number;
  meteosatDetectedCloud: number;
  meteosatDetectedButNoaaDark: number;
  meteosatCloudInFinal: number;
};

export function auditAfricaCloudSources(
  originalScience: ImageData,
  meteosat: ImageData,
  originalIr: ImageData | null,
  renderedAtlas: ImageData,
): { schema: string; untouchedLevel2: boolean; sectors: CloudSectorAudit[] } {
  const {width: w,height: h,data: base}=originalScience;
  if(w<16||h<16||meteosat.width!==w||meteosat.height!==h||
    renderedAtlas.width!==w||renderedAtlas.height!==h||
    (originalIr && (originalIr.width!==w || originalIr.height!==h)))
    throw new Error("Cloud source audit requires identical georeferenced world-atlas dimensions");
  const visual=meteosat.data, final=renderedAtlas.data, ir=originalIr?.data;
  const reports:CloudSectorAudit[]=[];
  let immutable=true;
  for(const {key,bbox} of CLOUD_AUDIT_SECTORS){
    const [west,south,east,north]=bbox;
    const x0=Math.max(0,Math.floor((west+180)/360*w));
    const x1=Math.min(w,Math.ceil((east+180)/360*w));
    const y0=Math.max(0,Math.floor((90-north)/180*h));
    const y1=Math.min(h,Math.ceil((90-south)/180*h));
    const result:CloudSectorAudit={
      sector:key,pixels:0,nativeLevel2:0,nativeLevel2Clear:0,
      styledMeteosat:0,noaaIrVisual:0,modelGfs:0,noData:0,
      visuallyDark:0,greyDetail:0,brightCloud:0,
      noaaSourceValid:0,noaaSourceDark:0,meteosatDetectedCloud:0,
      meteosatDetectedButNoaaDark:0,meteosatCloudInFinal:0,
    };
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const o=(y*w+x)*4;
      result.pixels++;
      const science=base[o+1]>0;
      const source=final[o+2],density=final[o],coverage=final[o+1];
      if(science){
        result.nativeLevel2++;
        if(base[o]===0)result.nativeLevel2Clear++;
        // The source may be a cached intermediate or shader-only visual,
        // but a real science pixel must never be mutated in the atlas.
        for(let k=0;k<4;k++)if(base[o+k]!==final[o+k])immutable=false;
      }else if(!coverage){
        result.noData++;
      }else if(source===232){
        result.noaaIrVisual++;
      }else if(source===224||source===248){
        result.styledMeteosat++;
      }else if(source===255){
        result.modelGfs++;
      }else {
        result.noData++;
      }
      if(density<10)result.visuallyDark++;
      else if(density<=90)result.greyDetail++;
      else if(density>=150)result.brightCloud++;
      const validIr=!!ir&&ir[o+1]===135&&ir[o+2]===232&&ir[o+3]===255;
      if(validIr){
        result.noaaSourceValid++;
        if(ir![o]<10)result.noaaSourceDark++;
      }
      const actualMeteosat=(visual[o+2]===224||visual[o+2]===248)&&
        visual[o+1]>0 && visual[o]>=64;
      if(!science&&actualMeteosat){
        result.meteosatDetectedCloud++;
        if(validIr&&ir![o]<10)result.meteosatDetectedButNoaaDark++;
        if((source===224||source===248)&&density>=10)result.meteosatCloudInFinal++;
      }
    }
    reports.push(result);
  }
  return {schema:"cupola-cloud-source-audit/v1",
    untouchedLevel2:immutable,sectors:reports};
}
