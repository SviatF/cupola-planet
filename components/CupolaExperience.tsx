"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Cloud, Crosshair, Layers3, LocateFixed, Pause, Play, Satellite, Search, Share2, Sparkles, Sun, Volume2, VolumeX, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type ViewMode = "ISS CUPOLA" | "GEOSTATIONARY" | "FREE CAMERA";
type ExperienceMode = "CINEMA" | "EXPLORE";
type IssData = { latitude: number; longitude: number; altitude: number; velocity: number; timestamp: number };
type WeatherData = { temperature: number; cloudCover: number; windSpeed: number; weatherCode: number; updatedAt: string };
type SpaceWeatherData = { kp: number; updatedAt: string; source: string };
type PlaceResult = { id: number; name: string; country: string; admin1: string | null; latitude: number; longitude: number; timezone: string };

const DAY_TEXTURE = "/api/satellite";
const NIGHT_TEXTURE = "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png";
const CLOUD_TEXTURE = "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png";

const EARTH_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; void main(){ vUv=uv; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const EARTH_FRAGMENT_SHADER = "uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; void main(){ vec3 n=normalize(vWorldNormal); float sunDot=dot(n,normalize(sunDirection)); float dayMix=smoothstep(-0.08,0.18,sunDot); vec3 day=texture2D(dayTexture,vUv).rgb; vec3 night=texture2D(nightTexture,vUv).rgb; float twilight=1.0-smoothstep(-0.18,0.08,abs(sunDot)); vec3 nightSide=day*0.035 + night*1.75*lightsEnabled; vec3 color=mix(nightSide,day*1.06,dayMix); color += vec3(0.28,0.16,0.08)*twilight*0.08; gl_FragColor=vec4(color,1.0); }";

function getSunDirection(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24);
  const dec = 0.006918 - 0.399912*Math.cos(g) + 0.070257*Math.sin(g) - 0.006758*Math.cos(2*g) + 0.000907*Math.sin(2*g) - 0.002697*Math.cos(3*g) + 0.00148*Math.sin(3*g);
  const lon = THREE.MathUtils.degToRad((12 - hour) * 15);
  return new THREE.Vector3(Math.cos(dec)*Math.cos(lon), Math.sin(dec), Math.cos(dec)*Math.sin(lon)).normalize();
}

function latLonToPoint(lat: number, lon: number, radius = 2.54) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-radius*Math.sin(phi)*Math.cos(theta), radius*Math.cos(phi), radius*Math.sin(phi)*Math.sin(theta));
}

function Earth(props: { clouds: boolean; cityLights: boolean; aurora: boolean; cinematic: boolean; marker?: { lat: number; lon: number } | null }) {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const textures = useTexture([DAY_TEXTURE, NIGHT_TEXTURE, CLOUD_TEXTURE]);
  const dayTexture = textures[0];
  const nightTexture = textures[1];
  const cloudTexture = textures[2];
  const uniforms = useMemo(() => ({
    dayTexture: { value: dayTexture },
    nightTexture: { value: nightTexture },
    sunDirection: { value: getSunDirection(new Date()) },
    lightsEnabled: { value: props.cityLights ? 1 : 0 },
  }), [dayTexture, nightTexture]);

  useEffect(() => {
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    cloudTexture.colorSpace = THREE.SRGBColorSpace;
  }, [dayTexture, nightTexture, cloudTexture]);

  useEffect(() => { uniforms.lightsEnabled.value = props.cityLights ? 1 : 0; }, [props.cityLights, uniforms]);

  useFrame((_state, delta) => {
    uniforms.sunDirection.value.copy(getSunDirection(new Date()));
    if (earthRef.current && props.cinematic) earthRef.current.rotation.y += delta * 0.01;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.004;
  });

  const markerPoint = props.marker ? latLonToPoint(props.marker.lat, props.marker.lon) : null;

  return (
    <group rotation={[0.08, -0.58, -0.1]}>
      <mesh ref={earthRef}>
        <sphereGeometry args={[2.5, 160, 160]} />
        <shaderMaterial uniforms={uniforms} vertexShader={EARTH_VERTEX_SHADER} fragmentShader={EARTH_FRAGMENT_SHADER} />
      </mesh>

      {props.clouds && (
        <mesh ref={cloudsRef} scale={1.008}>
          <sphereGeometry args={[2.5, 128, 128]} />
          <meshPhongMaterial map={cloudTexture} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      {props.aurora && (
        <group>
          <mesh position={[0, 2.23, 0]} scale={[1.95, 0.10, 1.95]} rotation={[0,0,0.06]}>
            <torusGeometry args={[0.66, 0.15, 32, 160]} />
            <meshBasicMaterial color="#65ffb5" transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh position={[0, 2.20, 0]} scale={[1.82, 0.08, 1.82]} rotation={[0.14,0,-0.04]}>
            <torusGeometry args={[0.72, 0.11, 24, 140]} />
            <meshBasicMaterial color="#8c72ff" transparent opacity={0.09} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      )}

      <mesh scale={1.035}>
        <sphereGeometry args={[2.5, 128, 128]} />
        <meshBasicMaterial color="#3f87ff" transparent opacity={0.055} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {markerPoint && (
        <group position={markerPoint}>
          <mesh>
            <sphereGeometry args={[0.035, 24, 24]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh scale={2.7}>
            <sphereGeometry args={[0.035, 20, 20]} />
            <meshBasicMaterial color="#49a9ff" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Scene(props: { layers: { clouds: boolean; cityLights: boolean; aurora: boolean }; mode: ExperienceMode; view: ViewMode; marker?: { lat: number; lon: number } | null }) {
  const controls = useRef<any>(null);
  const flyTarget = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!controls.current) return;
    const camera = controls.current.object;
    if (props.view === "GEOSTATIONARY") camera.position.set(0.4, 0.1, 8.6);
    if (props.view === "ISS CUPOLA") camera.position.set(0.15, 0.12, 5.15);
    if (props.view === "FREE CAMERA") camera.position.set(0.25, 0.3, 6.2);
    camera.lookAt(0, 0, 0);
    controls.current.update();
  }, [props.view]);

  useEffect(() => {
    if (!props.marker || !controls.current) return;
    const point = latLonToPoint(props.marker.lat, props.marker.lon, 1)
      .applyEuler(new THREE.Euler(0.08, -0.58, -0.1, "XYZ"))
      .normalize()
      .multiplyScalar(props.view === "ISS CUPOLA" ? 4.15 : 5.15);
    flyTarget.current = point;
  }, [props.marker, props.view]);

  useFrame((_state, delta) => {
    if (!flyTarget.current || !controls.current) return;
    const camera = controls.current.object as THREE.PerspectiveCamera;
    const alpha = 1 - Math.pow(0.001, delta);
    camera.position.lerp(flyTarget.current, alpha * 0.55);
    camera.lookAt(0, 0, 0);
    controls.current.target.lerp(new THREE.Vector3(0, 0, 0), alpha);
    controls.current.update();
    if (camera.position.distanceTo(flyTarget.current) < 0.025) {
      flyTarget.current = null;
    }
  });


  return (
    <>
      <color attach="background" args={["#010208"]} />
      <fog attach="fog" args={["#010208", 7, 15]} />
      <ambientLight intensity={0.05} />
      <directionalLight position={[6, 2, 4]} intensity={1.15} color="#fff4dd" />
      <pointLight position={[5.8, 2.0, 3.8]} intensity={1.8} color="#ffdca8" />
      <group position={[5.8, 2.0, 3.8]}>
        <mesh><sphereGeometry args={[0.15, 24, 24]} /><meshBasicMaterial color="#fff8dc" /></mesh>
        <mesh scale={3.8}><sphereGeometry args={[0.15, 20, 20]} /><meshBasicMaterial color="#ffbe72" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      </group>
      <pointLight position={[-4, -2, -3]} intensity={0.45} color="#2455ff" />
      <Stars radius={90} depth={55} count={3500} factor={2.3} saturation={0.25} fade speed={0.12} />
      <Earth clouds={props.layers.clouds} cityLights={props.layers.cityLights} aurora={props.layers.aurora} cinematic={props.mode === "CINEMA"} marker={props.marker} />
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
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [timeline, setTimeline] = useState(0);
  const [sound, setSound] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"layers" | "now" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

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
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/space-weather");
        if (!response.ok) return;
        const data = await response.json();
        if (active) setSpaceWeather(data);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => { active = false; window.clearInterval(timer); };
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

  const searchPlaces = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const response = await fetch("/api/geocode?q=" + encodeURIComponent(q));
      const data = await response.json();
      setSearchResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectPlace = (place: PlaceResult) => {
    setSelectedPlace(place);
    setCoords({ lat: place.latitude, lon: place.longitude });
    setSearchOpen(false);
    setSearchResults([]);
  };

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
            <Scene layers={layers} mode={mode} view={view} marker={coords} />
          </Suspense>
        </Canvas>
      </div>

      <div className="vignette" />
      {view === "ISS CUPOLA" && <div className="cupola-frame" aria-hidden="true"><span className="cupola-rim rim-a" /><span className="cupola-rim rim-b" /><span className="cupola-rim rim-c" /></div>}
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
          <button aria-label="Search Earth" onClick={() => setSearchOpen(true)}><Search size={17} /></button>
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
          <div><Sparkles size={14} /><span><strong>AURORA</strong><small>{spaceWeather ? "Planetary Kp " + spaceWeather.kp.toFixed(1) + " · NOAA SWPC" : "Acquiring space weather…"}</small></span></div>
          <StatusPill tone="forecast">{spaceWeather ? "KP " + spaceWeather.kp.toFixed(1) : "FORECAST"}</StatusPill>
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
        <div className="source-note">SATELLITE BASE · NASA GIBS</div>
        <LayerRow checked={layers.clouds} label="Clouds" status="SATELLITE" tone="live" onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
        <LayerRow checked={layers.cityLights} label="City lights" status="OBSERVED" tone="live" onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
        <LayerRow checked={layers.aurora} label="Aurora" status="FORECAST" tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
      </aside>

      <section className="location-card hud">
        <div className="eyebrow">{selectedPlace ? "VIEWING" : coords ? "YOU ARE HERE" : "NOW ABOVE"}</div>
        <h1>{selectedPlace ? selectedPlace.name.toUpperCase() : coords ? "YOUR LOCATION" : "EARTH ORBIT"}</h1>
        <div className="coords">{Math.abs(currentLat).toFixed(4)}° {currentLat >= 0 ? "N" : "S"} · {Math.abs(currentLon).toFixed(4)}° {currentLon >= 0 ? "E" : "W"}</div>
        <div className="location-actions">
          <button className="locate-button" onClick={locateMe}><LocateFixed size={16} />{locating ? "LOCATING…" : coords ? "CENTER ON ME" : "FIND ME"}</button>
          {weather && <div className="weather-mini"><Cloud size={15} /><span>{Math.round(weather.temperature)}°C</span><small>{weather.cloudCover}% CLOUD</small></div>}
          <button className="locate-button secondary" onClick={() => setSearchOpen(true)}><Search size={16} />SEARCH EARTH</button>
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

      {searchOpen && (
        <div className="search-overlay">
          <div className="search-panel panel">
            <div className="sheet-head">
              <div>
                <div className="panel-title">SEARCH EARTH</div>
                <strong>Fly anywhere on the planet</strong>
              </div>
              <button onClick={() => setSearchOpen(false)}><X size={18} /></button>
            </div>

            <form className="earth-search" onSubmit={(event) => { event.preventDefault(); void searchPlaces(); }}>
              <Search size={18} />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tokyo, Reykjavik, Cape Town…"
              />
              <button type="submit">{searching ? "…" : "GO"}</button>
            </form>

            <div className="search-results">
              {searchResults.map((place) => (
                <button key={place.id} onClick={() => selectPlace(place)}>
                  <span>
                    <strong>{place.name}</strong>
                    <small>{[place.admin1, place.country].filter(Boolean).join(", ")}</small>
                  </span>
                  <span className="search-coords">{place.latitude.toFixed(2)}°, {place.longitude.toFixed(2)}°</span>
                </button>
              ))}
              {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <div className="search-empty">Search a city to begin orbital fly-to.</div>
              )}
            </div>
          </div>
        </div>
      )}

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
