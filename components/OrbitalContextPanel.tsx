"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Crosshair, X, ChevronDown, ChevronUp, Grip, MapPin, Sun, Sparkles } from "lucide-react";
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
type EarthEvent = { id: string; kind: string; title: string; detail: string; latitude: number; longitude: number };
type GeoSelection = { name: string; country?: string | null; latitude: number; longitude: number };
type SunriseSelection = { longitude: number; declination: number };
type Props = {
  satellite: OrbitalObject | null;
  station: Station | null;
  followingStation: boolean;
  followingSatellite: boolean;
  event: EarthEvent | null;
  place: GeoSelection | null;
  currentLocation: GeoSelection | null;
  sunrise: SunriseSelection | null;
  catalogGeneratedAt: string | null;
  onFollowSelected: () => void;
  onFollowStation: () => void;
  onClear: () => void;
  onNextEvent: () => void;
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

const EVENT_KIND: Record<string, { label: string; source: string }> = {
  "EARTHQUAKE": {label:"SEISMIC EVENT",source:"USGS OBSERVATION"},
  "CYCLONE": {label:"TROPICAL CYCLONE",source:"NHC TRACK / FORECAST"},
  "AURORA": {label:"AURORA ACTIVITY",source:"NOAA OVATION MODEL"},
  "WILDFIRE": {label:"FIRE HOTSPOT",source:"NASA FIRMS / EONET"},
  "VOLCANO": {label:"VOLCANIC EVENT",source:"NASA EONET"},
  "LIGHTNING OBSERVED": {label:"OBSERVED LIGHTNING ZONE",source:"NOAA / MTG ACCUMULATION · NOT INDIVIDUAL STRIKES"},
  "LIGHTNING MODEL": {label:"STORM POTENTIAL",source:"WEATHER MODEL FORECAST · NOT OBSERVED STRIKES"},
};
const bound=(x:number,min:number,max:number)=>Math.min(max,Math.max(min,x));

export default function OrbitalContextPanel({
  satellite,station,followingStation,followingSatellite,event,place,currentLocation,
  sunrise,catalogGeneratedAt,onFollowSelected,onFollowStation,onClear,onNextEvent,mobile=false,
}:Props) {
  const [expanded,setExpanded]=useState(false);
  const [offset,setOffset]=useState({x:0,y:0});
  const [clock,setClock]=useState(()=>Date.now());
  const card=useRef<HTMLElement|null>(null);
  const drag=useRef<{id:number,x:number,y:number,fromX:number,fromY:number}|null>(null);
  const focusKey=satellite?"satellite:"+satellite.id:
    followingStation&&station?"iss":event?"event:"+event.id:
    place?"place:"+place.name+":"+place.latitude:
    currentLocation?"user:"+currentLocation.latitude+":"+currentLocation.longitude:
    sunrise?"sunrise":null;
  useEffect(()=>{setExpanded(false);setOffset({x:0,y:0});},[focusKey]);
  useEffect(()=>{
    if(!satellite&&!followingStation)return;
    const interval=window.setInterval(()=>setClock(Date.now()),5000);
    return()=>window.clearInterval(interval);
  },[satellite,followingStation]);

  const selected= satellite ?? (followingStation && station ? {
    id:"25544",name:"INTERNATIONAL SPACE STATION",category:"STATION" as const,
    latitude:station.latitude,longitude:station.longitude,altitude:station.altitude,
    velocity:station.velocity/3600,epoch:null,source:"ISS position feed",
    motionTarget:null,track:station.track,
  } : null);
  const current=satellite?positionAt(satellite,clock):followingStation&&station?
    {latitude:station.latitude,longitude:station.longitude,altitude:station.altitude}:null;
  const position=event??place??currentLocation;
  const dataAt=satellite?catalogGeneratedAt:followingStation?station?.updatedAt:null;
  const parsedAt=dataAt?Date.parse(dataAt):NaN;
  const ageMinutes=Number.isFinite(parsedAt)?Math.max(0,Math.floor((clock-parsedAt)/60000)):null;
  const objectType=selected?"satellite":event?"event":place?"place":currentLocation?"location":sunrise?"sunrise":null;

  // A purely passive layer toggle does NOT open the inspector; only explicit
  // object selection (including a direct ?satellite= link) produces a focus.
  if(!focusKey||!objectType)return null;
  const eventMeta=event ? EVENT_KIND[event.kind] ?? {label:event.kind,source:"EVENT FEED"}:null;
  const name=selected?.name ?? event?.title ?? place?.name ??
    (currentLocation?"YOUR LOCATION":"SUNRISE TERMINATOR");
  const label=selected?"ORBITAL OBJECT":eventMeta?.label ??
    (place?"SELECTED PLACE":currentLocation?"SELECTED LOCATION":"SOLAR TERMINATOR");
  const onStart=(e:ReactPointerEvent<HTMLElement>)=>{
    if(mobile||e.pointerType==="touch"||!(e.target instanceof Element)||e.target.closest("button"))return;
    drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,fromX:offset.x,fromY:offset.y};
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove=(e:ReactPointerEvent<HTMLElement>)=>{
    const d=drag.current;
    if(!d||d.id!==e.pointerId||!card.current)return;
    const width=card.current.offsetWidth,height=card.current.offsetHeight;
    setOffset({
      x:bound(d.fromX+e.clientX-d.x,-20,window.innerWidth-28-width-8),
      y:bound(d.fromY+e.clientY-d.y,-32,window.innerHeight-88-height-12),
    });
  };
  const onEnd=(e:ReactPointerEvent<HTMLElement>)=>{
    if(drag.current?.id===e.pointerId)drag.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return (
    <section ref={card} data-orbital-context={objectType}
      data-orbital-expanded={expanded?"true":"false"}
      className={"orbital-context orbital-context-compact panel hud"+(mobile?" orbital-context--mobile":"")}
      style={mobile?undefined:{transform:`translate3d(${offset.x}px,${offset.y}px,0)`}}>
      <div className="orbital-panel-heading orbital-drag-handle"
        onPointerDown={onStart} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd}>
        <span><Grip size={11} aria-hidden="true"/> {label}</span>
        <button onClick={onClear} aria-label="Close object inspector" title="Close"><X size={14}/></button>
      </div>
      <div className="orbital-compact-top">
        <div className="orbital-identity">
          <h2>{name}</h2>
          {selected ? <div className="orbital-meta">{selected.category} · NORAD {selected.id}</div> :
            event ? <div className="orbital-meta">{eventMeta?.source}</div> :
            place ? <div className="orbital-meta">{place.country||"GEOGRAPHIC LOCATION"}</div> :
            <div className="orbital-meta">{sunrise?"SOLAR POSITION · UTC":"YOUR SELECTED COORDINATES"}</div>}
        </div>
      </div>
      {selected && <div className="orbital-compact-preview"><SatelliteIllustration kind={selected.category}/></div>}
      {selected&&current ? (
        <>
          <div className="orbital-compact-metrics">
            <div><small>ALTITUDE</small><strong>{Math.round(current.altitude)} <em>KM</em></strong></div>
            <div><small>SPEED</small><strong>{selected.velocity.toFixed(2)} <em>KM/S</em></strong></div>
          </div>
          <div className="orbital-compact-coordinates">
            <span>ABOVE · ESTIMATED COORDINATES</span>
            <b>{coord(current.latitude,true)} · {coord(current.longitude,false)}</b>
          </div>
          {expanded&&(
            <div className="orbital-expanded-content">
              <div className="orbital-data-lines">
                <div><span>EST. ORBIT PERIOD</span><b>{periodApproxMinutes(current.altitude).toFixed(1)} MIN</b></div>
                <div><span>EST. ORBITS / DAY</span><b>{(1440/periodApproxMinutes(current.altitude)).toFixed(1)}</b></div>
                <div><span>LATITUDE</span><b>{coord(current.latitude,true)}</b></div>
                <div><span>LONGITUDE</span><b>{coord(current.longitude,false)}</b></div>
              </div>
              <GroundTrack track={selected.track} location={current}/>
              <div className="orbital-source">
                <span>ORBITAL DATA · {satellite?"CELESTRAK OMM / SGP4":"ISS POSITION FEED"}</span>
                <small>{ageMinutes!==null?"POSITION SNAPSHOT "+ageMinutes+" MIN AGO":"SOURCE TIME UNAVAILABLE"} · POSITIONS INTERPOLATED · NO DIRECT TELEMETRY</small>
              </div>
              <div className="orbital-small-disclaimer">CATEGORY SCHEMATIC · NOT AN EXACT MODEL</div>
            </div>
          )}
          <div className="orbital-actions orbital-compact-actions">
            <button className="orbital-main-action" aria-pressed={satellite?followingSatellite:followingStation} onClick={satellite?onFollowSelected:onFollowStation}>
              <Crosshair size={13}/>{satellite?(followingSatellite?"STOP FOLLOW":"FOLLOW SATELLITE"):
                (followingStation?"STOP FOLLOW":"FOLLOW ISS")}</button>
            <button className="orbital-ghost-action" aria-expanded={expanded}
              onClick={()=>setExpanded(x=>!x)}>{expanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>}
              {expanded?"LESS":"DETAILS"}</button>
          </div>
        </>
      ) : event&&position ? (
        <>
          <div className="orbital-compact-event-detail" title={event.detail}>{event.detail}</div>
          <div className="orbital-compact-coordinates">
            <span>EVENT LOCATION</span>
            <b>{coord(position.latitude,true)} · {coord(position.longitude,false)}</b>
          </div>
          {expanded&&<div className="orbital-expanded-content">
            <div className="orbital-data-lines">
              <div><span>CATEGORY</span><b>{eventMeta?.label}</b></div>
              <div><span>DATA TYPE</span><b>{eventMeta?.source}</b></div>
              <div><span>LATITUDE</span><b>{coord(position.latitude,true)}</b></div>
              <div><span>LONGITUDE</span><b>{coord(position.longitude,false)}</b></div>
            </div>
            <div className="orbital-small-disclaimer">Source classifications are retained. Forecasts are not direct observations.</div>
          </div>}
          <div className="orbital-actions orbital-compact-actions">
            <button className="orbital-main-action" onClick={onNextEvent}><Sparkles size={13}/> NEXT EVENT</button>
            <button className="orbital-ghost-action" aria-expanded={expanded} onClick={()=>setExpanded(x=>!x)}>
              {expanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>} {expanded?"LESS":"DETAILS"}</button>
          </div>
        </>
      ) : sunrise ? (
        <>
          <div className="orbital-compact-coordinates"><span>DAY / NIGHT BOUNDARY · CALCULATED</span>
            <b>{coord(sunrise.longitude,false)}</b></div>
          <div className="orbital-compact-coordinates"><span>SOLAR DECLINATION</span>
            <b>{Math.abs(sunrise.declination).toFixed(2)}° {sunrise.declination>=0?"N":"S"}</b></div>
          <div className="orbital-small-disclaimer">Calculated terminator, not a measured geographic event.</div>
        </>
      ) : position ? (
        <>
          <div className="orbital-compact-coordinates"><span>{place?"SEARCH RESULT LOCATION":"BROWSER-REPORTED COORDINATES"}</span>
            <b>{coord(position.latitude,true)} · {coord(position.longitude,false)}</b></div>
          <div className="orbital-actions orbital-compact-actions">
            <button className="orbital-ghost-action" onClick={onClear}><MapPin size={13}/> CLOSE</button>
          </div>
        </>
      ) : null}
    </section>
  );
}
