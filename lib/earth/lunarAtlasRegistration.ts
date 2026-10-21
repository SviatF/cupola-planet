/**
 * CUPOLA 4.6 — NASA SVS Moon Kit #4720 / Three.js sphere texture registration.
 *
 * NASA's LROC 4K equirectangular raster is north-up and centred at 0° lunar
 * longitude. The renderer's THREE.SphereGeometry is rotated -90° about Y,
 * so its central texture meridian (u=0.5) maps to lunar body +Z.
 *
 * Lunar body local axes follow the camera/IAU frame:
 *  +X = +90° east, +Y = north pole, +Z = 0° prime meridian.
 *
 * This deliberately does NOT depend on date or illumination; IAU rotation
 * is a separate parent-group transform and must never alter texture UVs.
 *
 * Source: https://svs.gsfc.nasa.gov/4720/
 */
export type LunarAtlasPoint={latitudeDeg:number;longitudeDeg:number};
export type LunarAtlasVector={x:number;y:number;z:number};
export type LunarAtlasUv={u:number;v:number};
const toRad=Math.PI/180;
export const LROC_MAP_WIDTH=4096;
export const LROC_MAP_HEIGHT=2048;

export function lunarAtlasUv(p:LunarAtlasPoint):LunarAtlasUv{
  if(!Number.isFinite(p.latitudeDeg)||Math.abs(p.latitudeDeg)>90||
     !Number.isFinite(p.longitudeDeg))
    throw new Error("Invalid lunar atlas latitude/longitude");
  // Unlike canvas top-down pixels, Three.js UV v grows from south to north.
  const u=((0.5+p.longitudeDeg/360)%1+1)%1;
  const v=0.5+p.latitudeDeg/180;
  return {u,v};
}

export function lunarAtlasSurfacePoint(p:LunarAtlasPoint):LunarAtlasVector{
  lunarAtlasUv(p);
  const lat=p.latitudeDeg*toRad,lon=p.longitudeDeg*toRad;
  const cl=Math.cos(lat);
  return{x:cl*Math.sin(lon),y:Math.sin(lat),z:cl*Math.cos(lon)};
}

export function lunarAtlasPixel(p:LunarAtlasPoint,width=LROC_MAP_WIDTH,height=LROC_MAP_HEIGHT){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)
    throw new Error("Invalid texture resolution");
  const {u,v}=lunarAtlasUv(p);
  return {
    x:Math.min(width-1,Math.floor(u*width)),
    y:Math.min(height-1,Math.floor((1-v)*height))
  };
}

// IAU-approved *feature centre* latitudes and east-positive longitudes,
// independently published by USGS Gazetteer of Planetary Nomenclature.
// These positions are not picked from this texture; the GPU script projects
// them into the actual LROC raster and samples the resulting pixels.
// Rechecked against USGS 2026-10-21; listed source URL in every control.
export const LUNAR_ATLAS_CONTROL_POINTS=[
  {name:"TYCHO",featureId:6163,type:"CRATER",
   latitudeDeg:-43.30,longitudeDeg:-11.22,
   source:"https://planetarynames.wr.usgs.gov/Feature/6163"},
  {name:"COPERNICUS",featureId:1296,type:"CRATER",
   latitudeDeg:9.62,longitudeDeg:-20.08,
   source:"https://planetarynames.wr.usgs.gov/Feature/1296"},
  {name:"MARE CRISIUM",featureId:3671,type:"MARE",
   latitudeDeg:16.18,longitudeDeg:59.10,
   source:"https://planetarynames.wr.usgs.gov/Feature/3671"},
  {name:"MARE TRANQUILLITATIS",featureId:3691,type:"MARE",
   latitudeDeg:8.35,longitudeDeg:30.83,
   source:"https://planetarynames.wr.usgs.gov/Feature/3691"},
  {name:"MARE IMBRIUM",featureId:3678,type:"MARE",
   latitudeDeg:34.72,longitudeDeg:-14.91,
   source:"https://planetarynames.wr.usgs.gov/Feature/3678"},
  {name:"MARE SERENITATIS",featureId:3686,type:"MARE",
   latitudeDeg:27.29,longitudeDeg:18.36,
   source:"https://planetarynames.wr.usgs.gov/Feature/3686"}
] as const;
