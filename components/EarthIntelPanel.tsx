"use client";
import {useMemo, useState} from "react";

export type EarthSourceKind = "OBSERVED"|"DELAYED"|"MODEL"|"VISUAL"|"STATIC"|"CALCULATED"|"OFFLINE";
export type EarthSourceRow = {
  id:string; name:string;kind:EarthSourceKind;
  source:string; detail:string; time:string|null; coverage?:number|null;
};
export type EarthDiscoveryRow = {
  id:string;kind:string;title:string;detail:string;
  latitude:number;longitude:number;occurredAt:string|null;
};
type Props = {
  sources: EarthSourceRow[];
  events: EarthDiscoveryRow[];
  now:number;
  onFocus:(id:string)=>void;
  onClose:()=>void;
};
const typeLabel=(kind:string)=>kind==="LIGHTNING MODEL"||kind==="AURORA"?"FORECAST":
  kind==="VOLCANO"?"INCIDENT REPORT":kind==="WILDFIRE"?"DETECTION / REPORT":
  kind==="CYCLONE"?"ADVISORY":"OBSERVATION";
const ageLabel=(time:string|null, now:number)=>{
  if(!time)return "TIME UNKNOWN";
  const stamp=Date.parse(time);
  if(!Number.isFinite(stamp)||stamp>now+300000)return "UNVERIFIED TIME";
  const minutes=Math.max(0,Math.floor((now-stamp)/60000));
  return minutes<60?minutes+" MIN AGO":minutes<1440?Math.floor(minutes/60)+" H AGO":Math.floor(minutes/1440)+" D AGO";
};
export default function EarthIntelPanel({sources,events,now,onFocus,onClose}:Props){
  const [tab,setTab]=useState<"sources"|"events"|"timeline">("sources");
  const [offsetHours,setOffsetHours]=useState(0);
  const [eventFilter,setEventFilter]=useState("ALL");
  const kinds=useMemo(()=>["ALL",...new Set(events.map(e=>e.kind))], [events]);
  const visibleEvents=useMemo(()=>events
    .filter(e=>eventFilter==="ALL"||e.kind===eventFilter)
    .slice(0,18),[events,eventFilter]);
  const timedEvents=useMemo(()=>events.filter(e=>{
    const ts=Date.parse(e.occurredAt??"");
    return Number.isFinite(ts)&&ts<=now-offsetHours*3600000 &&
      ts>=now-24*3600000;
  }).sort((a,b)=>Date.parse(b.occurredAt??"")-Date.parse(a.occurredAt??"")),
  [events,now,offsetHours]);
  return <aside className="earth-intel-panel panel" role="dialog" aria-label="Earth source health and event explorer">
    <header className="earth-intel-head">
      <div><small>CUPOLA / EARTH INTELLIGENCE</small><strong>EARTH RIGHT NOW</strong></div>
      <button onClick={onClose} aria-label="Close Earth intelligence">×</button>
    </header>
    <div className="earth-intel-tabs" role="tablist" aria-label="Earth intelligence views">
      {(["sources","events","timeline"] as const).map(v=><button key={v}
        role="tab" aria-selected={tab===v} className={tab===v?"selected":""}
        onClick={()=>setTab(v)}>{v==="sources"?"DATA HEALTH":v==="events"?"EVENTS":"24H HISTORY"}</button>)}
    </div>
    {tab==="sources"&&<div className="earth-intel-scroll">
      <p className="earth-intel-explainer">Source status is per layer, not proof of a globally live photograph. Observation time, model time and rendering time are different.</p>
      {sources.map(s=><article className="earth-source-row" key={s.id}>
        <div className="earth-source-top"><strong>{s.name}</strong><span className={"earth-source-kind "+s.kind.toLowerCase()}>{s.kind}</span></div>
        <p>{s.detail}</p>
        <div className="earth-source-meta"><span>{s.source}</span><span>{s.time?ageLabel(s.time,now):"NO VERIFIED TIMESTAMP"}</span></div>
        {s.coverage!=null&&Number.isFinite(s.coverage)&&<div className="earth-source-coverage" aria-label={"Observed coverage "+Math.round(s.coverage*100)+" percent"}>
          <div><span style={{width:Math.max(0,Math.min(100,s.coverage*100))+"%"}}/></div>
          <small>{Math.round(s.coverage*100)}% declared footprint · not global LIVE</small>
        </div>}
      </article>)}
    </div>}
    {tab==="events"&&<div className="earth-intel-scroll">
      <p className="earth-intel-explainer">Tap an event to fly to its coordinates. Forecasts and incident reports are identified separately from instrument observations.</p>
      <div className="earth-event-filters" aria-label="Filter Earth events">{kinds.map(k=><button key={k}
        aria-pressed={eventFilter===k} onClick={()=>setEventFilter(k)}>{k}</button>)}</div>
      {visibleEvents.length===0&&<p className="earth-intel-empty">No validated events currently loaded for this filter.</p>}
      {visibleEvents.map(e=><button className="earth-event-choice" key={e.id} onClick={()=>onFocus(e.id)}>
        <span>{typeLabel(e.kind)} · {e.kind}</span><strong>{e.title}</strong><small>{e.detail}</small>
        <em>FLY TO EVENT ↗</em>
      </button>)}
    </div>}
    {tab==="timeline"&&<div className="earth-intel-scroll">
      <p className="earth-intel-explainer">Observed event history only, from currently loaded validated feeds. This is <strong>not</strong> a historical satellite-cloud video or a complete global archive.</p>
      <div className="earth-timeline-input">
        <div><strong>{offsetHours===0?"NOW":"−"+offsetHours+" HOURS"}</strong><span>{new Date(now-offsetHours*3600000).toISOString().slice(0,16).replace("T"," ")} UTC</span></div>
        <input type="range" min="0" max="24" step="1" value={offsetHours}
          onChange={e=>setOffsetHours(Number(e.target.value))}
          aria-label="Show observations before selected time"/>
        <div className="earth-timeline-ends"><span>NOW</span><span>−24H</span></div>
      </div>
      {timedEvents.length===0&&<p className="earth-intel-empty">No timestamp-verified events in the loaded 24-hour window before the selected time.</p>}
      {timedEvents.map(e=><button key={e.id} className="earth-event-choice" onClick={()=>onFocus(e.id)}>
        <span>{new Date(e.occurredAt!).toISOString().slice(0,16).replace("T"," ")} UTC · {e.kind}</span>
        <strong>{e.title}</strong><small>{e.detail}</small><em>FLY TO EVENT ↗</em>
      </button>)}
    </div>}
    <footer className="earth-intel-foot">CUPOLA° · Obs ≠ Forecast ≠ Rendering · No invented live data</footer>
  </aside>;
}
