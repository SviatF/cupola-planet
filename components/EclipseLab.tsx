"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import * as THREE from "three";
import {MOON_ECLIPSE_FRAGMENT,MOON_ECLIPSE_OUTGOING_LIGHT,
  MOON_ECLIPSE_VERTEX_DECL,MOON_ECLIPSE_VERTEX_POSITION} from "@/lib/earth/moonEclipseShader";
import {eclipseLabAt,ECLIPSE_LAB_EVENTS,type EclipseLabEventId,
  type EclipseLabGeometry} from "@/lib/earth/eclipseLabGeometry";
import "./eclipse-lab.css";

const FIRST=ECLIPSE_LAB_EVENTS[1];
const RADIUS_KM=1737.4;
const DEFAULT_MAX_MS=Date.parse(FIRST.utc);
const formatUTC=(ms:number)=>new Date(ms).toISOString().replace(".000Z"," UTC").replace("T"," · ");
const inputUTC=(ms:number)=>new Date(ms).toISOString().slice(0,16);
const initialState={id:FIRST.id as EclipseLabEventId,anchorMs:DEFAULT_MAX_MS,instantMs:DEFAULT_MAX_MS};
type LabScene={renderer:THREE.WebGLRenderer;scene:THREE.Scene;camera:THREE.PerspectiveCamera;
  material:THREE.MeshStandardMaterial;uniforms:Record<string,THREE.IUniform>;
  sun:THREE.DirectionalLight;frame:number;resize:ResizeObserver;dispose:()=>void};
function LabMoon({geometry,onAssets,onError}:{
  geometry:EclipseLabGeometry;
  onAssets:(value:string)=>void;
  onError:(value:string)=>void;
}){
  const surface=useRef<HTMLDivElement>(null);
  const state=useRef<LabScene|null>(null);
  const callbacks=useRef({onAssets,onError});
  callbacks.current={onAssets,onError};
  useEffect(()=>{
    const holder=surface.current;
    if(!holder)return;
    let disposed=false;
    let renderer:THREE.WebGLRenderer;
    try {
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});
    } catch {
      callbacks.current.onError("WebGL unavailable on this device");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.25;
    renderer.setClearColor(0x030508,0);
    renderer.domElement.dataset.eclipseLabCanvas="active";
    holder.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(30,1,10,100000);
    camera.position.set(0,0,7300);
    camera.lookAt(0,0,0);
    const sunlight=new THREE.DirectionalLight("#ffffff",3.2);
    sunlight.position.set(0,0,12000);
    scene.add(sunlight);
    scene.add(new THREE.AmbientLight(0xffffff,0.025));
    const uniforms:Record<string,THREE.IUniform>={
      uEclipseEarthWorld:{value:new THREE.Vector3(0,0,384400)},
      uEclipseApparentOffset:{value:new THREE.Vector3()},
      uEclipseActive:{value:0},
      uEclipseSunDirection:{value:new THREE.Vector3(0,0,1)},
      uEclipseEarthRadius:{value:6371},
      uEclipseSolarAngularRadius:{value:Math.asin(695700/149600000)}
    };
    const material=new THREE.MeshStandardMaterial({
      color:"#f5f5f5",roughness:1,metalness:0
    });
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader
        .replace("#include <common>","#include <common>\n"+MOON_ECLIPSE_VERTEX_DECL)
        .replace("#include <project_vertex>",
          "#include <project_vertex>\n"+MOON_ECLIPSE_VERTEX_POSITION);
      shader.fragmentShader=shader.fragmentShader
        .replace("#include <common>","#include <common>\n"+MOON_ECLIPSE_FRAGMENT)
        .replace("#include <opaque_fragment>",
          MOON_ECLIPSE_OUTGOING_LIGHT+"\n#include <opaque_fragment>");
    };
    material.customProgramCacheKey=()=>"cupola-eclipse-lab-v1";
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(RADIUS_KM,160,104),material);
    sphere.rotation.y=-Math.PI/2;
    scene.add(sphere);
    const owned:THREE.Texture[]=[];
    const loader=new THREE.TextureLoader();
    let maps=0;
    const updateAssets=()=>{
      if(!disposed)callbacks.current.onAssets(
        maps===2?"NASA LROC + LOLA ACTIVE":
          maps===1?"NASA HD MAP LOADED":"NASA TEXTURES LOADING"
      );
    };
    const load=(url:string,onLoaded:(texture:THREE.Texture)=>void)=>{
      loader.load(url,t=>{
        if(disposed){t.dispose();return;}
        owned.push(t);
        onLoaded(t);
        maps++;
        updateAssets();
      },undefined,()=>{if(!disposed)callbacks.current.onError("NASA asset unavailable: "+url);});
    };
    load("/moon/lroc_color_4k.webp",texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;
      material.map=texture;
      material.color.set("#ffffff");
      material.needsUpdate=true;
    });
    load("/moon/lola_height_4k.webp",texture=>{
      material.bumpMap=texture;
      material.bumpScale=18;
      material.displacementMap=texture;
      material.displacementScale=5;
      material.displacementBias=-2.5;
      material.needsUpdate=true;
    });
    const resize=()=>{
      if(disposed)return;
      const w=Math.max(1,holder.clientWidth);
      const h=Math.max(1,holder.clientHeight);
      renderer.setSize(w,h,false);
      camera.aspect=w/h;
      camera.updateProjectionMatrix();
    };
    const observer=new ResizeObserver(resize);
    observer.observe(holder);
    resize();
    const labScene:LabScene={renderer,scene,camera,material,uniforms,sun:sunlight,
      frame:0,resize:observer,dispose:()=>{
        disposed=true;
        cancelAnimationFrame(labScene.frame);
        observer.disconnect();
        sphere.geometry.dispose();
        material.dispose();
        for(const texture of owned)texture.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      }};
    state.current=labScene;
    const draw=()=>{
      if(disposed)return;
      renderer.render(scene,camera);
      labScene.frame=requestAnimationFrame(draw);
    };
    draw();
    return ()=>{
      if(state.current===labScene)state.current=null;
      labScene.dispose();
    };
  },[]);
  useEffect(()=>{
    const s=state.current;
    if(!s)return;
    s.uniforms.uEclipseEarthWorld.value.set(
      geometry.earthWorldKm.x,geometry.earthWorldKm.y,geometry.earthWorldKm.z
    );
    s.uniforms.uEclipseSunDirection.value.set(
      geometry.sunDirection.x,geometry.sunDirection.y,geometry.sunDirection.z
    );
    s.uniforms.uEclipseSolarAngularRadius.value=geometry.solarAngularRadiusRad;
    s.uniforms.uEclipseActive.value=geometry.eclipseActive?1:0;
    const dir=geometry.sunDirection;
    s.sun.position.set(dir.x*15000,dir.y*15000,dir.z*15000);
  },[geometry]);
  return <div ref={surface} className="eclipse-lab-canvas" aria-label="Rendered lunar eclipse model"/>;
}

export default function EclipseLab(){
  const [clock,setClock]=useState(initialState);
  const [assetStatus,setAssetStatus]=useState("NASA TEXTURES LOADING");
  const [renderError,setRenderError]=useState("");
  const [autoPlay,setAutoPlay]=useState(false);
  const geometry=useMemo(()=>eclipseLabAt(new Date(clock.instantMs)),[clock.instantMs]);
  const timeDelta=Math.round((clock.instantMs-clock.anchorMs)/60000);
  const choosePreset=useCallback((id:EclipseLabEventId)=>{
    if(id==="custom"){
      setClock(v=>({...v,id:"custom",anchorMs:v.instantMs}));
      return;
    }
    const entry=ECLIPSE_LAB_EVENTS.find(e=>e.id===id);
    if(!entry)return;
    const ms=Date.parse(entry.utc);
    setClock({id,anchorMs:ms,instantMs:ms});
    setAutoPlay(false);
  },[]);
  const changeCustom=(value:string)=>{
    const next=Date.parse(value+"Z");
    if(!Number.isFinite(next))return;
    const year=new Date(next).getUTCFullYear();
    if(year<2000||year>2030)return;
    setClock({id:"custom",anchorMs:next,instantMs:next});
    setAutoPlay(false);
  };
  const move=(minutes:number)=>setClock(v=>({
    ...v,instantMs:Math.max(Date.UTC(2000,0,1),
      Math.min(Date.UTC(2030,11,31,23,59),v.instantMs+minutes*60000))
  }));
  useEffect(()=>{
    if(!autoPlay)return;
    const timer=window.setInterval(()=>{
      setClock(v=>{
        const next=v.instantMs+60000;
        const end=v.anchorMs+180*60000;
        return {...v,instantMs:next>end?v.anchorMs-180*60000:next};
      });
    },300);
    return ()=>window.clearInterval(timer);
  },[autoPlay]);
  const marker=geometry.moonCentreObscuration;
  const status=marker>=0.999?"UMBRAL ALIGNMENT":marker>0?"ECLIPSE GEOMETRY":"NO CENTRE OCCULTATION";
  return <main className="eclipse-lab" data-eclipse-lab="simulation">
    <header className="eclipse-lab-header">
      <a href="/" className="eclipse-lab-brand" aria-label="Return to LIVE CUPOLA">CUPOLA°</a>
      <div className="eclipse-lab-center">CELESTIAL REPLAY <span>·</span> ECLIPSE LAB 4.2</div>
      <a href="/" className="eclipse-lab-back">← RETURN TO LIVE EARTH</a>
    </header>
    <div className="eclipse-lab-layout">
      <section className="eclipse-lab-visual">
        <div className="eclipse-lab-hud">
          <span className="eclipse-lab-mode">SIMULATION · NOT LIVE</span>
          <span className="eclipse-lab-object">MOON <small>NASA LROC / LOLA</small></span>
        </div>
        <LabMoon geometry={geometry} onAssets={setAssetStatus} onError={setRenderError}/>
        <div className="eclipse-lab-reticle" aria-hidden="true" />
        <div className="eclipse-lab-bottom">
          <span>GEOCENTRIC VIEW · MODEL REPLAY</span>
          <span className="eclipse-lab-asset">{assetStatus}</span>
        </div>
        {renderError&&<div role="alert" className="eclipse-lab-error">{renderError}</div>}
      </section>
      <aside className="eclipse-lab-panel">
        <div className="eclipse-lab-eyebrow">CUPOLA / SCIENTIFIC QA</div>
        <h1>Lunar eclipse replay<span>.</span></h1>
        <p className="eclipse-lab-intro">
          Examine Earth's umbra and penumbra across the lunar surface at a
          selected historical UTC instant. This does not alter LIVE Earth.
        </p>
        <label className="eclipse-lab-label" htmlFor="eclipse-event">ECLIPSE PRESET</label>
        <select id="eclipse-event" value={clock.id}
          onChange={e=>choosePreset(e.target.value as EclipseLabEventId)}>
          {ECLIPSE_LAB_EVENTS.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
          <option value="custom">CUSTOM UTC DATE</option>
        </select>
        <label className="eclipse-lab-label" htmlFor="eclipse-datetime">UTC DATE &amp; TIME</label>
        <input id="eclipse-datetime" aria-label="UTC date and time"
          type="datetime-local" min="2000-01-01T00:00" max="2030-12-31T23:59"
          value={inputUTC(clock.instantMs)}
          onChange={e=>changeCustom(e.target.value)}/>
        <div className="eclipse-lab-timeline-head">
          <span>TIMELINE · ±180 MIN</span>
          <strong>{timeDelta>=0?"+":""}{timeDelta} MIN</strong>
        </div>
        <input className="eclipse-lab-range" type="range" min={-180} max={180} step={1}
          value={Math.max(-180,Math.min(180,timeDelta))}
          aria-label="Minutes relative to selected eclipse peak"
          onChange={e=>setClock(v=>({...v,instantMs:v.anchorMs+Number(e.target.value)*60000}))}/>
        <div className="eclipse-lab-track-label"><span>−3 H</span><span>REFERENCE UTC</span><span>+3 H</span></div>
        <div className="eclipse-lab-buttons">
          <button onClick={()=>move(-15)}>−15 MIN</button>
          <button onClick={()=>setAutoPlay(v=>!v)}>{autoPlay?"PAUSE":"PLAY"}</button>
          <button onClick={()=>move(15)}>+15 MIN</button>
          <button onClick={()=>{setClock(v=>({...v,instantMs:v.anchorMs}));setAutoPlay(false);}}>RESET</button>
        </div>
        <div className="eclipse-lab-time" data-eclipse-lab-utc={geometry.timeUtc}>{formatUTC(clock.instantMs)}</div>
        <div className="eclipse-lab-metrics">
          <div><span>EARTH SOLAR OCCULTATION AT MOON CENTRE</span>
            <strong data-eclipse-obscuration={marker.toFixed(4)}>{(marker*100).toFixed(1)}%</strong></div>
          <div><span>GEOCENTRIC EARTH/SUN SEPARATION</span>
            <strong>{geometry.earthSunSeparationDeg.toFixed(3)}°</strong></div>
          <div><span>EARTH–MOON DISTANCE</span>
            <strong>{Math.round(geometry.moonDistanceKm).toLocaleString("en-US")} KM</strong></div>
        </div>
        <div className="eclipse-lab-result" data-eclipse-lab-status={status}>{status}</div>
        <p className="eclipse-lab-disclaimer">
          NASA eclipse catalogue supplies preset dates. Astronomy Engine supplies
          geocentric model geometry. Copper totality color is an uncalibrated estimate;
          lunar libration, atmospheric spectra, local weather and contact timings
          are not certified. This is a separate QA scene, not LIVE or JPL.
        </p>
        <a className="eclipse-lab-source" href="https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html"
          target="_blank" rel="noreferrer">NASA ECLIPSE CATALOGUE ↗</a>
      </aside>
    </div>
  </main>;
}
