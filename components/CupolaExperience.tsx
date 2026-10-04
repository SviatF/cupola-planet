"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Cloud, Crosshair, Layers3, LocateFixed, Pause, Play, Satellite, Share2, Sparkles, Sun, Volume2, VolumeX, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";

type ViewMode = "ISS CUPOLA" | "GEOSTATIONARY" | "FREE CAMERA";
type ExperienceMode = "CINEMA" | "EXPLORE";
type IssData = { latitude: number; longitude: number; altitude: number; velocity: number; timestamp: number };
type WeatherData = { temperature: number; cloudCover: number; windSpeed: number; weatherCode: number; updatedAt: string };

const DAY_TEXTURE = "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg";
const NIGHT_TEXTURE = "https://threejs.org/examples/textures/planets/earth_lights_2048.png";
const CLOUD_TEXTURE = "https://threejs.org/examples/textures/planets/earth_clouds_1024.png";

function Earth(props: { clouds: boolean; cityLights: boolean; aurora: boolean; cinematic: boolean }) {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const textures = useTexture([DAY_TEXTURE, NIGHT_TEXTURE, CLOUD_TEXTURE]);
  const dayTexture = textures[0];
  const nightTexture = textures[1];
  const cloudTexture = textures[2];

  useEffect(() => {
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    cloudTexture.colorSpace = THREE.SRGBColorSpace;
  }, [dayTexture, nightTexture, cloudTexture]);

  useFrame((_state, delta) => {
    if (earthRef.current && props.cinematic) earthRef.current.rotation.y += delta * 0.012;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.005;
  });

  return (
    <group rotation={[0.08, -0.58, -0.1]}>
      <mesh ref={earthRef}>
        <sphereGeometry args={[2.5, 128, 128]} />
        <meshStandardMaterial
          map={dayTexture}
          roughness={0.92}
          metalness={0.02}
          emissive="#ffffff"
          emissiveMap={props.cityLights ? nightTexture : null}
          emissiveIntensity={props.cityLights ? 0.62 : 0.01}
        />
      </mesh>

      {props.clouds && (
        <mesh ref={cloudsRef} scale={1.008}>
          <sphereGeometry args={[2.5, 96, 96]} />
          <meshPhongMaterial map={cloudTexture} transparent opacity={0.24} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      {props.aurora && (
        <mesh position={[0, 2.22, 0]} scale={[1.95, 0.12, 1.95]}>
          <torusGeometry args={[0.65, 0.17, 24, 120]} />
          <meshBasicMaterial color="#62ffb2" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}

      <mesh scale={1.025}>
        <sphereGeometry args={[2.5, 96, 96]} />
        <meshBasicMaterial color="#4c8dff" transparent opacity={0.045} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function Scene(props: { layers: { clouds: boolean; cityLights: boolean; aurora: boolean }; mode: ExperienceMode; view: ViewMode }) {
  const controls = useRef<any>(null);

  useEffect(() => {
    if (!controls.current) return;
    const camera = controls.current.object;
    if (props.view === "GEOSTATIONARY") camera.position.set(0.4, 0.1, 8.6);
    if (props.view === "ISS CUPOLA") camera.position.set(0.15, 0.12, 5.15);
    if (props.view === "FREE CAMERA") camera.position.set(0.25, 0.3, 6.2);
    camera.lookAt(0, 0, 0);
    controls.current.update();
  }, [props.view]);

  return (
    <>
      <color attach="background" args={["#010208"]} />
      <fog attach="fog" args={["#010208", 7, 15]} />
      <ambientLight intensity={0.05} />
      <directionalLight position={[6, 2, 4]} intensity={3.4} color="#fff4dd" />
      <pointLight position={[-4, -2, -3]} intensity={0.45} color="#2455ff" />
      <Stars radius={90} depth={55} count={3500} factor={2.3} saturation={0.25} fade speed={0.12} />
      <Earth clouds={props.layers.clouds} cityLights={props.layers.cityLights} aurora={props.layers.aurora} cinematic={props.mode === "CINEMA"} />
      <OrbitControls
        ref={controls}
        enablePan={false}
        minDistance={3.6}
        maxDistance={10}
        autoRotate={props.mode === "CINEMA"}
        autoRotateSpeed={0.14}
        enableDamping
        dampingFactor={0.035}
        rotateSpeed={0.28}
        zoomSpeed={0.45}
      />
    </>
  );
}

function StatusPill(props: { children: React.ReactNode; tone?: "live" | "forecast" | "model" }) {
  return <span className={"status-pill " + (props.tone || "live")}>{props.children}</span>;
}

function LayerRow(props: { checked: boolean; label: string; status: string; tone: "live" | "forecast" | "model"; onChange: () => void }) {
  return (
    <button className="layer-row" onClick={props.onChange}>
      <span className={"layer-check " + (props.checked ? "active" : "")}>{props.checked ? "✓" : ""}</span>
      <span>{props.label}</span>
      <StatusPill tone={props.tone}>{props.status}</StatusPill>
    </button>
  );
}

export default function CupolaExperience() {
  const [mode, setMode] = useState<ExperienceMode>("EXPLORE");
  const [view, setView] = useState<ViewMode>("ISS CUPOLA");
  const [layers, setLayers] = useState({ clouds: true, cityLights: true, aurora: true });
  const [now, setNow] = useState(new Date());
  const [iss, setIss] = useState<IssData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [timeline, setTimeline] = useState(0);
  const [sound, setSound] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"layers" | "now" | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/iss");
        if (!response.ok) return;
        const data = await response.json();
        if (active) setIss(data);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    fetch("/api/weather?lat=" + coords.lat + "&lon=" + coords.lon, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setWeather(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, [coords]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTimeline((value) => value >= 24 ? -24 : Math.min(24, value + 0.016));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  const locateMe = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: Number(position.coords.latitude.toFixed(4)), lon: Number(position.coords.longitude.toFixed(4)) });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
  };

  const utc = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateLabel = now.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  const currentLat = coords ? coords.lat : iss ? iss.latitude : 31.441;
  const currentLon = coords ? coords.lon : iss ? iss.longitude : -158.92;

  return (
    <main className={"cupola " + (mode === "CINEMA" ? "cinema-mode" : "")}>
      <div className="scene-wrap">
        <Canvas dpr={[1, 1.7]} camera={{ position: [0.15, 0.12, 5.15], fov: 42, near: 0.1, far: 200 }} gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}>
          <Suspense fallback={null}>
            <Scene layers={layers} mode={mode} view={view} />
          </Suspense>
        </Canvas>
      </div>

      <div className="vignette" />
      <div className="noise" />

      <header className="topbar hud">
        <div>
          <div className="brand">CUPOLA<sup>°</sup></div>
          <div className="brand-tag">EARTH. RIGHT NOW.</div>
        </div>
        <div className="live-meta">
          <span><i /> LIVE</span>
          <b>{dateLabel} · {utc} UTC</b>
        </div>
        <div className="header-actions">
          <button aria-label="Share"><Share2 size={17} /></button>
          <button aria-label="Sound" onClick={() => setSound(!sound)}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
        </div>
      </header>

      <section className="right-now panel hud">
        <div className="panel-title">RIGHT NOW</div>
        <div className="event-row">
          <div><Satellite size={14} /><span><strong>ISS</strong><small>{iss ? "Orbit position acquired" : "Acquiring orbit…"}</small></span></div>
          <StatusPill>LIVE</StatusPill>
        </div>
        <div className="event-row">
          <div><Sparkles size={14} /><span><strong>AURORA</strong><small>Space weather layer</small></span></div>
          <StatusPill tone="forecast">FORECAST</StatusPill>
        </div>
        <div className="event-row">
          <div><Sun size={14} /><span><strong>SUN</strong><small>Day/night model active</small></span></div>
          <StatusPill tone="model">MODEL</StatusPill>
        </div>
      </section>

      <aside className="controls panel hud">
        <div className="panel-title">VIEW</div>
        {(["ISS CUPOLA", "GEOSTATIONARY", "FREE CAMERA"] as ViewMode[]).map((item) => (
          <button className="radio-row" key={item} onClick={() => setView(item)}>
            <span className={"radio " + (view === item ? "active" : "")} />
            {item}
          </button>
        ))}
        <div className="separator" />
        <div className="panel-title">LAYERS</div>
        <LayerRow checked={layers.clouds} label="Clouds" status="SATELLITE" tone="live" onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
        <LayerRow checked={layers.cityLights} label="City lights" status="OBSERVED" tone="live" onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
        <LayerRow checked={layers.aurora} label="Aurora" status="FORECAST" tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
      </aside>

      <section className="location-card hud">
        <div className="eyebrow">{coords ? "YOU ARE HERE" : "NOW ABOVE"}</div>
        <h1>{coords ? "YOUR LOCATION" : "EARTH ORBIT"}</h1>
        <div className="coords">{Math.abs(currentLat).toFixed(4)}° {currentLat >= 0 ? "N" : "S"} · {Math.abs(currentLon).toFixed(4)}° {currentLon >= 0 ? "E" : "W"}</div>
        <div className="location-actions">
          <button className="locate-button" onClick={locateMe}><LocateFixed size={16} />{locating ? "LOCATING…" : coords ? "CENTER ON ME" : "FIND ME"}</button>
          {weather && <div className="weather-mini"><Cloud size={15} /><span>{Math.round(weather.temperature)}°C</span><small>{weather.cloudCover}% CLOUD</small></div>}
        </div>
      </section>

      <section className="telemetry panel hud">
        <div><span>ALTITUDE</span><strong>{iss ? Math.round(iss.altitude) : 408} <small>KM</small></strong></div>
        <div><span>VELOCITY</span><strong>{iss ? (iss.velocity / 3600).toFixed(2) : "7.66"} <small>KM/S</small></strong></div>
        <div><span>ORBIT</span><strong>92 <small>MIN</small></strong></div>
        <div><span>SUNRISES</span><strong>16 <small>/ DAY</small></strong></div>
      </section>

      <div className="mode-switch panel hud">
        <button className={mode === "CINEMA" ? "active" : ""} onClick={() => setMode("CINEMA")}>CINEMA</button>
        <button className={mode === "EXPLORE" ? "active" : ""} onClick={() => setMode("EXPLORE")}>EXPLORE</button>
      </div>

      <section className="timeline panel hud">
        <div className="timeline-head"><span>-24H</span><strong>{timeline > -0.2 && timeline < 0.2 ? "NOW" : (timeline > 0 ? "+" : "") + timeline.toFixed(1) + "H"}</strong><span>+24H</span></div>
        <input aria-label="Earth timeline" type="range" min="-24" max="24" step="0.1" value={timeline} onChange={(event) => { setTimeline(Number(event.target.value)); setPlaying(false); }} />
        <div className="timeline-actions">
          <button onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
          <button className="active">×1</button><button>×60</button><button>×600</button>
        </div>
      </section>

      <nav className="mobile-nav hud">
        <button onClick={locateMe}><Crosshair size={18} /><span>Find me</span></button>
        <button onClick={() => setMobilePanel("layers")}><Layers3 size={18} /><span>Layers</span></button>
        <button onClick={() => setMobilePanel("now")}><Satellite size={18} /><span>Live</span></button>
      </nav>

      {mobilePanel && (
        <div className="mobile-sheet">
          <div className="sheet-head"><strong>{mobilePanel === "layers" ? "EARTH LAYERS" : "RIGHT NOW"}</strong><button onClick={() => setMobilePanel(null)}><X size={18} /></button></div>
          {mobilePanel === "layers" ? (
            <div>
              <LayerRow checked={layers.clouds} label="Clouds" status="SATELLITE" tone="live" onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
              <LayerRow checked={layers.cityLights} label="City lights" status="OBSERVED" tone="live" onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
              <LayerRow checked={layers.aurora} label="Aurora" status="FORECAST" tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
            </div>
          ) : (
            <div className="sheet-stats">
              <span><Satellite size={16} /> ISS {iss ? Math.round(iss.altitude) + " km" : "loading"}</span>
              <span><Cloud size={16} /> {weather ? weather.cloudCover + "% cloud" : "Find your location for weather"}</span>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
