/**
 * CUPOLA Eclipse Lab: independent, isolated historic-geocentric REPLAY only.
 * Astronomy Engine positions are in J2000 equatorial AU, converted to km.
 * This is deliberately NOT the JPL/IERS LIVE renderer source and does not
 * predict precise contact times, local visibility, or eclipse Danjon color.
 */
import * as Astronomy from "astronomy-engine";
import {eclipseSolarDiscObscuration,lunarEclipseMayReachSurface} from "./lunarShadowField";

// NASA catalogue peaks are TD; here UTC ~= TD − 75 s (Delta T),
// not the TD clock strings copied directly into a JavaScript Date.
export const ECLIPSE_LAB_EVENTS=[
  {id:"2025-mar",label:"14 MAR 2025 · TOTAL",utc:"2025-03-14T06:58:41Z",kind:"TOTAL"},
  {id:"2025-sep",label:"07 SEP 2025 · TOTAL",utc:"2025-09-07T18:11:43Z",kind:"TOTAL"},
  {id:"2026-mar",label:"03 MAR 2026 · TOTAL",utc:"2026-03-03T11:33:37Z",kind:"TOTAL"},
  {id:"2026-aug",label:"28 AUG 2026 · PARTIAL",utc:"2026-08-28T04:12:49Z",kind:"PARTIAL"}
] as const;
export type EclipseLabEventId=typeof ECLIPSE_LAB_EVENTS[number]["id"]|"custom";
type Vec={x:number;y:number;z:number};
const dot=(a:Vec,b:Vec)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a:Vec,b:Vec):Vec=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const scale=(a:Vec,s:number):Vec=>({x:a.x*s,y:a.y*s,z:a.z*s});
const cross=(a:Vec,b:Vec):Vec=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const length=(a:Vec)=>Math.hypot(a.x,a.y,a.z);
const unit=(a:Vec):Vec=>{const m=length(a);if(!(m>0))throw Error("Invalid eclipse geometry");return scale(a,1/m);};
const origin:Vec={x:0,y:0,z:0};
const KM_PER_AU=149597870.7;
export type EclipseLabGeometry={
  timeUtc:string;
  moonDistanceKm:number;
  sunDistanceKm:number;
  earthWorldKm:Vec;
  moonToSunWorldKm:Vec;
  sunDirection:Vec;
  solarAngularRadiusRad:number;
  eclipseActive:boolean;
  moonCentreObscuration:number;
  earthSunSeparationDeg:number;
  model:"ASTRONOMY_ENGINE_GEOCENTRIC_PREVIEW";
};
export function eclipseLabAt(time:Date):EclipseLabGeometry{
  if(!Number.isFinite(time.getTime())||time.getUTCFullYear()<2000||time.getUTCFullYear()>2030)
    throw Error("Eclipse Lab only supports 2000–2030 UTC replay");
  // Geocentric true angular geometry, independent of Earth-fixed LIVE sky.
  const rawMoon=Astronomy.GeoVector(Astronomy.Body.Moon,time,false);
  const rawSun=Astronomy.GeoVector(Astronomy.Body.Sun,time,false);
  const moon=scale({x:rawMoon.x,y:rawMoon.y,z:rawMoon.z},KM_PER_AU);
  const sun=scale({x:rawSun.x,y:rawSun.y,z:rawSun.z},KM_PER_AU);
  const toEarth=unit(scale(moon,-1));
  // View the Moon from the geocentric Earth direction; its north projection
  // is only an approximate map orientation, not a full lunar-libration model.
  const north={x:0,y:0,z:1};
  const right=unit(cross(north,toEarth));
  const up=cross(toEarth,right);
  const toSun=sub(sun,moon);
  const project=(v:Vec):Vec=>({x:dot(v,right),y:dot(v,up),z:dot(v,toEarth)});
  const earthWorldKm={x:0,y:0,z:length(moon)};
  const moonToSunWorldKm=project(toSun);
  const sunDirection=unit(moonToSunWorldKm);
  const moonCentreObscuration=eclipseSolarDiscObscuration(
    origin,earthWorldKm,moonToSunWorldKm
  );
  const eclipseActive=lunarEclipseMayReachSurface(
    origin,earthWorldKm,moonToSunWorldKm
  );
  const earthSunSeparationDeg=Math.acos(Math.max(-1,Math.min(1,sunDirection.z)))*180/Math.PI;
  return {timeUtc:time.toISOString(),moonDistanceKm:length(moon),
    sunDistanceKm:length(toSun),earthWorldKm,moonToSunWorldKm,
    sunDirection,solarAngularRadiusRad:Math.asin(695700/length(toSun)),
    eclipseActive,moonCentreObscuration,earthSunSeparationDeg,
    model:"ASTRONOMY_ENGINE_GEOCENTRIC_PREVIEW"};
}
