"use client";

import { useEffect, useMemo, useState } from "react";
import { Crosshair, Satellite as SatelliteIcon, Radio, Orbit, X, Compass, ArrowUpRight } from "lucide-react";
import { satelliteMotionFactor } from "@/lib/earth/satelliteMotion";

type GeoPoint = { latitude: number; longitude: number; altitude: number };
type OrbitPoint = GeoPoint & { timestamp: string | number };
type OrbitalObject = GeoPoint & {
  id: string;
  name: string;
  category: "STATION" | "WEATHER" | "EARTH OBSERVATION" | "STARLINK" | "OTHER";
  velocity: number; // km/s from SGP4
  epoch: string | null;
  source: string;
  motionTarget: (GeoPoint & { timestamp: string }) | null;
  track: OrbitPoint[];
};
type Station = GeoPoint & {
  velocity: number; // km/h in /api/iss
  updatedAt: string;
  track: OrbitPoint[];
};
type EarthEvent = { kind: string; title: string; detail: string; latitude: number; longitude: number };
type Props = {
  satellite: OrbitalObject | null;
  station: Station | null;
  followingStation: boolean;
  followingSatellite: boolean;
  event: EarthEvent | null;
  catalogCount: number;
  starlinkCount: number;
  catalogGeneratedAt: string | null;
  satellitesEnabled: boolean;
  onFollowSelected: () => void;
  onFollowStation: () => void;
  onEnableSatellites: () => void;
  onClear: () => void;
  onExplore: () => void;
  canExplore: boolean;
  mobile?: boolean;
};

// A fast SVG is deliberate: creating a second WebGL canvas for the satellite
// preview would increase GPU load. This generic diagram is NOT a verified
// manufacturer model or a photograph of an individual NORAD spacecraft.
function SatelliteIllustration({ kind }: { kind: string }) {
  const isStation = kind === "STATION";
  const isStarlink = kind === "STARLINK";
  return (
    <div className="orbital-visual" data-orbital-illustration={kind}>
      <svg viewBox="0 0 320 150" role="img" aria-label={"Schematic illustration of a " + kind.toLowerCase() + " satellite"}>
        <defs>
          <radialGradient id="orbit-schematic-halo"><stop stopColor="#164b76" stopOpacity=".52"/><stop offset="1" stopColor="#07101a" stopOpacity="0"/></radialGradient>
          <linearGradient id="orbit-schematic-panel" x1="0" x2="1">
            <stop stopColor="#0c2539"/><stop offset=".52" stopColor="#244b66"/><stop offset="1" stopColor="#09192b"/>
          </linearGradient>
          <linearGradient id="orbit-schematic-body" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#a1bdd1"/><stop offset=".45" stopColor="#435f76"/><stop offset="1" stopColor="#172737"/>
          </linearGradient>
        </defs>
        <ellipse cx="160" cy="77" rx="130" ry="67" fill="url(#orbit-schematic-halo)"/>
        <ellipse cx="160" cy="78" rx="132" ry="38" transform="rotate(-19 160 78)" fill="none" stroke="#42728e" strokeWidth=".8" strokeDasharray="3 6" opacity=".45"/>
        <g transform="translate(160 76) rotate(-15)">
          <path d="M-22 -3H-29 M22 -3H29" stroke="#9dbfd3" strokeWidth="3"/>
          {isStation ? (
            <>
              {[-1,1].map(side=>(
                <g key={side} transform={`translate(${side*83} 0)`}>
                  <rect x="-59" y="-19" width="118" height="38" rx="2" fill="url(#orbit-schematic-panel)" stroke="#77b2d1" strokeWidth="1.5"/>
                  {[-40,-20,0,20,40].map(x=><path key={x} d={`M${x} -19V19`} stroke="#75bbdd" strokeWidth=".7" opacity=".45"/>)}
                  <path d="M-59 0H59" stroke="#80c9ed" strokeWidth=".8" opacity=".55"/>
                </g>
              ))}
              <rect x="-36" y="-10" width="72" height="20" rx="3" fill="url(#orbit-schematic-body)" stroke="#bcd9e8"/>
              <path d="M-8 -10V-29H8V-10 M0 10V27" fill="none" stroke="#afcfe0" strokeWidth="3"/>
            </>
          ) : (
            <>
              <rect x="-119" y={isStarlink ? "-25" : "-20"} width="89" height={isStarlink ? "50" : "40"} rx="2" fill="url(#orbit-schematic-panel)" stroke="#6cb5d9" strokeWidth="1.2"/>
              <rect x="30" y={isStarlink ? "-25" : "-20"} width="89" height={isStarlink ? "50" : "40"} rx="2" fill="url(#orbit-schematic-panel)" stroke="#6cb5d9" strokeWidth="1.2"/>
              {[-111,-92,-73,-54,-35,38,57,76,95,114].map(x=><path key={x} d={`M${x} -20V20`} stroke="#5a9cc5" strokeWidth=".8" opacity=".57"/>)}
              <path d="M-119 0H-30 M30 0H119" stroke="#9bc8e0" strokeWidth=".8" opacity=".5"/>
              <rect x="-24" y="-13" width="48" height="26" rx="5" fill="url(#orbit-schematic-body)" stroke="#c0dfed" strokeWidth="1.3"/>
              <path d="M-6 -13V-22H6V-13" fill="none" stroke="#b8d7e8" strokeWidth="2"/>
              <circle cx="0" cy="0" r="6" fill="#cae6f3" opacity=".8"/>
            </>
          )}
        </g>
        <circle cx="269" cy="33" r="2" fill="#89d9ff" opacity=".9"/>
        <path d="M250 33H263M269 41V47" stroke="#6badd0" strokeWidth="1" opacity=".7"/>
      </svg>
      <span className="orbital-visual-label">CATEGORY SCHEMATIC · NOT AN EXACT MODEL</span>
    </div>
  );
}
function positionAt(s: OrbitalObject, nowMs: number): GeoPoint {
  const target=s.motionTarget;
  if(!target) return {latitude:s.latitude,longitude:s.longitude,altitude:s.altitude};
  const t=satelliteMotionFactor(target.timestamp,nowMs);
  const rad=Math.PI/180;
  const vec=(lat:number,lon:number):[number,number,number]=>[
    Math.cos(lat*rad)*Math.cos(lon*rad),
    Math.sin(lat*rad),
    Math.cos(lat*rad)*Math.sin(lon*rad),
  ];
  const a=vec(s.latitude,s.longitude),b=vec(target.latitude,target.longitude);
  const x=a[0]*(1-t)+b[0]*t,y=a[1]*(1-t)+b[1]*t,z=a[2]*(1-t)+b[2]*t;
  return {
    latitude:Math.atan2(y,Math.hypot(x,z))/rad,
    longitude:Math.atan2(z,x)/rad,
    altitude:s.altitude+(target.altitude-s.altitude)*t,
  };
}
function coord(value:number,latitude:boolean) {
  return Math.abs(value).toFixed(3)+"° "+(latitude?(value>=0?"N":"S"):(value>=0?"E":"W"));
}
function periodApproxMinutes(altKm:number) {
  // Circular-orbit estimate. NOT an exact OMM mean-motion-derived period.
  const r=(6371+altKm)*1000;
  return 2*Math.PI*Math.sqrt((r*r*r)/3.986004418e14)/60;
}
function trackSegments(points:readonly OrbitPoint[]) {
  const lines: string[]=[];
  let piece="";
  let lastLon:number|null=null;
  for(const p of points) {
    if(!Number.isFinite(p.longitude)||!Number.isFinite(p.latitude))continue;
    const lon=Math.max(-180,Math.min(180,p.longitude));
    const px=(lon+180)*320/360;
    const py=(90-Math.max(-90,Math.min(90,p.latitude)))*120/180;
    if(lastLon!==null&&Math.abs(lon-lastLon)>180){
      if(piece)lines.push(piece);
      piece="";
    }
    piece+=(piece?" L":"M")+px.toFixed(2)+" "+py.toFixed(2);
    lastLon=lon;
  }
  if(piece)lines.push(piece);
  return lines;
}
function GroundTrack({track,location}:{track:readonly OrbitPoint[];location:GeoPoint}) {
  const segments=useMemo(()=>trackSegments(track),[track]);
  const x=(location.longitude+180)*320/360;
  const y=(90-location.latitude)*120/180;
  return (
    <div className="orbital-track-preview">
      <div className="orbital-subhead"><span>GROUND TRACK</span><small>{segments.length?"SGP4 PROPAGATION":"AWAITING ORBIT TRACK"}</small></div>
      <svg viewBox="0 0 320 120" role="img" aria-label="Geographic latitude longitude grid showing selected orbital ground track and position">
        <rect width="320" height="120" rx="6" fill="#081422"/>
        {[40,80,120,160,200,240,280].map(a=><line key={a} x1={a} x2={a} y1="0" y2="120" stroke="#2a4c65" strokeWidth=".7" opacity=".55"/>)}
        {[30,60,90].map(a=><line key={a} y1={a} y2={a} x1="0" x2="320" stroke="#2a4c65" strokeWidth=".7" opacity=".55"/>)}
        <path d="M0 60H320 M160 0V120" stroke="#587e9a" strokeWidth=".8" strokeDasharray="3 5" opacity=".5"/>
        {segments.map((d,i)=><path key={i} d={d} fill="none" stroke="#62bff5" strokeWidth="1.9" opacity=".8"/>)}
        <circle cx={x} cy={y} r="8" fill="#5acbff" opacity=".13"/>
        <circle cx={x} cy={y} r="3.2" fill="#b3efff" stroke="#1f91d2" strokeWidth="1"/>
      </svg>
      <div className="orbital-track-foot"><span>180°W</span><span>0°</span><span>180°E</span></div>
    </div>
  );
}

export default function OrbitalContextPanel({
  satellite,station,followingStation,followingSatellite,event,catalogCount,
  starlinkCount,catalogGeneratedAt,satellitesEnabled,onFollowSelected,
  onFollowStation,onEnableSatellites,onClear,onExplore,canExplore,mobile=false,
}:Props) {
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{
    if(!satellite && !followingStation)return;
    const id=window.setInterval(()=>setClock(Date.now()),5000);
    return ()=>window.clearInterval(id);
  },[satellite,followingStation]);
  const current=satellite?positionAt(satellite,clock):followingStation&&station?
    {latitude:station.latitude,longitude:station.longitude,altitude:station.altitude}:null;
  const object=satellite??(followingStation&&station?{
    id:"25544",name:"INTERNATIONAL SPACE STATION",category:"STATION" as const,
    latitude:station.latitude,longitude:station.longitude,altitude:station.altitude,
    velocity:station.velocity/3600,epoch:null,source:"ISS position feed",
    motionTarget:null,track:station.track,
  }:null);
  const sampleTime=satellite?catalogGeneratedAt:followingStation?station?.updatedAt:null;
  const ageMinutes=sampleTime?Math.max(0,Math.floor((clock-Date.parse(sampleTime))/60000)):null;
  const period=current?periodApproxMinutes(current.altitude):null;
  const ready=object&&current&&Number.isFinite(current.latitude)&&Number.isFinite(current.longitude);
  return (
    <section data-orbital-context={object?"satellite":event?"event":"overview"}
      className={"orbital-context panel hud"+(mobile?" orbital-context--mobile":"")}>
      <div className="orbital-panel-heading">
        <span>{object?"OBJECT IN FOCUS":event?"EARTH EVENT IN FOCUS":"ORBITAL OVERVIEW"}</span>
        {object||event?<button aria-label="Close orbital object details" onClick={onClear}><X size={15}/></button>:<i aria-hidden="true"/>}
      </div>
      {ready && object ? (
        <>
          <div className="orbital-identity"><span className="orbital-live-indicator">ORBIT ESTIMATE</span><h2>{object.name}</h2>
            <div className="orbital-meta">{object.category} <span>·</span> NORAD {object.id}</div></div>
          <SatelliteIllustration kind={object.category}/>
          <div className="orbital-primary-metrics">
            <div><small>ALTITUDE</small><strong>{Math.round(current.altitude).toLocaleString("en-US")} <em>KM</em></strong></div>
            <div><small>ORBITAL SPEED</small><strong>{object.velocity.toFixed(2)} <em>KM/S</em></strong></div>
          </div>
          <div className="orbital-data-lines">
            <div><span>EST. ORBIT PERIOD</span><b>{period?.toFixed(1)} MIN</b></div>
            <div><span>EST. ORBITS / DAY</span><b>{period?(1440/period).toFixed(1):"—"}</b></div>
            <div><span>LATITUDE</span><b>{coord(current.latitude,true)}</b></div>
            <div><span>LONGITUDE</span><b>{coord(current.longitude,false)}</b></div>
          </div>
          <GroundTrack track={object.track} location={current}/>
          <div className="orbital-source">
            <span>ORBITAL DATA · {satellite?"CELESTRAK OMM / SGP4":"ISS POSITION FEED"}</span>
            <small>{ageMinutes!==null&&Number.isFinite(ageMinutes)?"POSITION SNAPSHOT "+ageMinutes+" MIN AGO":"ACQUIRING SOURCE TIME"} · POSITIONS INTERPOLATED · NO DIRECT TELEMETRY</small>
          </div>
          <div className="orbital-actions">
            <button className="orbital-main-action" onClick={satellite?onFollowSelected:onFollowStation}><Crosshair size={14}/>{satellite?(followingSatellite?"STOP FOLLOW":"FOLLOW SATELLITE"):(followingStation?"STOP FOLLOW":"FOLLOW ISS")}</button>
            <button className="orbital-ghost-action" onClick={onClear} aria-label="Return to orbital overview"><X size={14}/> CLOSE</button>
          </div>
        </>
      ) : event ? (
        <div className="orbital-event-detail">
          <div className="orbital-feature-badge">GEOGRAPHIC EVENT</div>
          <h2>{event.title}</h2><p>{event.detail}</p>
          <div className="orbital-data-lines"><div><span>LATITUDE</span><b>{coord(event.latitude,true)}</b></div><div><span>LONGITUDE</span><b>{coord(event.longitude,false)}</b></div></div>
          <button className="orbital-main-action" onClick={onClear}>BACK TO ORBITAL OVERVIEW</button>
        </div>
      ) : (
        <div className="orbital-overview">
          <div className="orbital-overview-visual">
            <svg viewBox="0 0 320 154" role="img" aria-label="Stylized Earth with orbital paths">
              <defs><radialGradient id="orbit-overview-earth" cx=".3" cy=".2"><stop stopColor="#2a7bad"/><stop offset=".52" stopColor="#0a3056"/><stop offset="1" stopColor="#020a18"/></radialGradient></defs>
              <circle cx="160" cy="78" r="56" fill="url(#orbit-overview-earth)" stroke="#26679b" strokeWidth="1.2"/>
              <ellipse cx="160" cy="78" rx="137" ry="41" fill="none" stroke="#70bff0" strokeWidth="1.2" strokeDasharray="3 5" transform="rotate(-23 160 78)" opacity=".7"/>
              <ellipse cx="160" cy="78" rx="110" ry="60" fill="none" stroke="#548cb8" strokeWidth=".9" transform="rotate(38 160 78)" opacity=".45"/>
              <circle cx="68" cy="130" r="3.2" fill="#c0f1ff"/>
              <circle cx="262" cy="35" r="2.2" fill="#85d3ff"/>
            </svg>
            <div className="orbital-overview-caption">EARTH · ORBITAL OBJECTS</div>
          </div>
          <p className="orbital-intro">Select any satellite around Earth to inspect its trajectory and orbital parameters.</p>
          <div className="orbital-overview-numbers">
            <div><strong>{catalogCount?catalogCount.toLocaleString("en-US"):"—"}</strong><span>TRACKED OBJECTS</span></div>
            <div><strong>{starlinkCount?starlinkCount.toLocaleString("en-US"):"—"}</strong><span>STARLINK</span></div>
          </div>
          <div className="orbital-actions orbital-actions-stacked">
            <button className="orbital-main-action" onClick={satellitesEnabled?onFollowStation:onEnableSatellites}>
              {satellitesEnabled?<SatelliteIcon size={14}/>:<Radio size={14}/>}
              {satellitesEnabled?"FOLLOW THE ISS":"ENABLE SATELLITES"}
            </button>
            {satellitesEnabled&&<button className="orbital-ghost-action" onClick={onExplore} disabled={!canExplore}><Compass size={14}/> EXPLORE EARTH EVENTS <ArrowUpRight size={12}/></button>}
          </div>
          <div className="orbital-overview-note">{catalogCount?"CATALOG SNAPSHOT · "+(catalogGeneratedAt?"ORBIT DATA AVAILABLE":"UPDATING"):"ENABLE THE SATELLITES LAYER TO START"}</div>
        </div>
      )}
    </section>
  );
}
