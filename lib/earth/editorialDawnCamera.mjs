/**
 * CUPOLA 8.1 — physically sunlit dawn, carefully pulled back for Atlas.
 *
 * The SAME Earth-fixed UTC solar vector powers the planet shader, physical Sun,
 * atmosphere and camera. This is NOT a second light or painted/cloud replacement.
 *
 * Classic showed a dawn silhouette almost entirely on Earth's unlit side.
 * Daylit follows the exact same terminator, but from the twilight side so
 * white, observed clouds are ACTUALLY illuminated within the webpage crop.
 *
 * The classic camera remains available for A/B inspection at
 * /explore?embed=1&hero=sunrise&heroShot=classic.
 */
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const scale=(a,k)=>({x:a.x*k,y:a.y*k,z:a.z*k});
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=(p)=>{
  const len=Math.hypot(p.x,p.y,p.z);
  if(!(len>1e-12&&Number.isFinite(len)))throw Error("Editorial dawn: invalid solar frame");
  return scale(p,1/len);
};
const rad=(deg)=>deg*Math.PI/180;

/**
 * @param {{x:number,y:number,z:number}} earthFixedSunWorldDirection
 * @param {number} earthRadius
 * @param {"daylit"|"classic"} [shot] only the editorial /explore?embed=1 mode uses this
 */
export function editorialDawnCamera(earthFixedSunWorldDirection,earthRadius,shot="daylit"){
  const solar=unit(earthFixedSunWorldDirection);
  if(!Number.isFinite(earthRadius)||earthRadius<=0)throw Error("Invalid Earth radius");
  if(shot!=="daylit"&&shot!=="classic")throw Error("Unknown editorial camera shot");
  // The daylit 8.0 shot was too tight: distance 1.40 R with a steeply
  // diagonal limb. Move only the editorial daylit camera back by ~11%.
  // Keep classic as a reproducible A/B baseline and preserve the actual
  // UTC solar direction and cloud observations in both variants.
  const isClassic=shot==="classic";
  const distance=earthRadius*(isClassic?1.40:1.56);
  const earthLimbAngleRad=Math.asin(earthRadius/distance);

  // Photometric geometrical constraint: camera normal's Sun dot must be
  // -0.24 (38% of visible hemisphere approximately daylit) versus -0.696
  // (15.2% daylit) for classic. This is a REAL Sun/observer geometry change,
  // not cloud shader exposure. Twilight remains visible with the terminator.
  const sunCenterSeparationRad=isClassic
    ? earthLimbAngleRad+rad(0.88)
    : Math.acos(1-2*0.38);

  // Stable north-biased tangential orbit, no locked geography.
  const axis=Math.abs(solar.y)>0.97?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const north=unit(add(axis,scale(solar,-dot(axis,solar))));
  // Geostationary Arctic framing kept the camera near the pole as the Sun
  // moved. The NEW cover follows the sunrise around inhabited/tropical
  // longitudes: eastward tangential motion with a modest northward bank.
  const tangentAxis=isClassic?north:
    unit(add(scale(unit(cross(axis,solar)),0.86),scale(north,0.32)));
  const normal=unit(add(scale(solar,-Math.cos(sunCenterSeparationRad)),
    scale(tangentAxis,Math.sin(sunCenterSeparationRad))));
  const earthForward=scale(normal,-1);
  const towardSun=unit(add(solar,scale(earthForward,-dot(solar,earthForward))));

  // Keep a real, partially cropped solar disc near the outer right-hand edge
  // on desktop. The closer dawn-facing planet fills the orbital editorial
  // frame and brings naturally bright clouds onto the page. Smaller devices
  // may crop the solar disc rather than invent a replacement glow.
  // Less severe diagonally-cut globe, more recognizable orbital horizon;
  // the genuine solar disc remains near the upper-right crop.
  const compositionOffsetRad=rad(isClassic?37:51);
  const lookDirection=unit(add(scale(earthForward,Math.cos(compositionOffsetRad)),
    scale(towardSun,Math.sin(compositionOffsetRad))));
  const toSunOnScreen=unit(add(solar,scale(lookDirection,-dot(solar,lookDirection))));
  const side=unit(cross(lookDirection,toSunOnScreen));
  const roll=rad(isClassic?54:22);
  const up=unit(add(scale(side,-Math.cos(roll)),
    scale(toSunOnScreen,Math.sin(roll))));
  const right=unit(cross(lookDirection,up));
  const sunDotView=dot(solar,earthForward);
  return {
    normal,up,right,lookDirection,distance,earthLimbAngleRad,
    sunCenterSeparationRad,compositionOffsetRad,
    daylightFractionApprox:(1-sunDotView)/2,
    frameKind:"CUPOLA_EARTH_FIXED_DAWN_CAMERA",
    shot
  };
}


/**
 * Capture-only observatory camera, never used for the website's interactive
 * Explore controls or editorial sunrise header.
 *
 * Render the *actual* observed cloud texture at a whole-disk scale rather than
 * enlarging low-resolution source pixels or inventing artificial sharpening.
 * Physical Sun comes from the same ephemeris. At this viewing distance the
 * Sun itself is intentionally outside the 41-degree portrait frustum.
 */
export function editorialWideOrbitCamera(earthFixedSunWorldDirection,earthRadius){
  const solar=unit(earthFixedSunWorldDirection);
  if(!Number.isFinite(earthRadius)||earthRadius<=0)throw Error("Invalid Earth radius");
  const distance=earthRadius*4.15; // ~67% of a 41-degree-tall frame by diameter
  const earthLimbAngleRad=Math.asin(earthRadius/distance);
  const daylightFraction=0.68;
  // A majority of the visible Earth is really sunlit; the terminator remains
  // geometric. Do not increase cloud density or substitute forecast coverage.
  const sunCenterSeparationRad=Math.acos(1-2*daylightFraction);
  const axis=Math.abs(solar.y)>0.97?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const north=unit(add(axis,scale(solar,-dot(axis,solar))));
  const tangentAxis=unit(add(scale(unit(cross(axis,solar)),0.86),scale(north,0.32)));
  const normal=unit(add(scale(solar,-Math.cos(sunCenterSeparationRad)),
    scale(tangentAxis,Math.sin(sunCenterSeparationRad))));
  const earthForward=scale(normal,-1);
  const towardSun=unit(add(solar,scale(earthForward,-dot(solar,earthForward))));
  const compositionOffsetRad=rad(8);
  const lookDirection=unit(add(scale(earthForward,Math.cos(compositionOffsetRad)),
    scale(towardSun,Math.sin(compositionOffsetRad))));
  const toSunOnScreen=unit(add(solar,scale(lookDirection,-dot(solar,lookDirection))));
  const side=unit(cross(lookDirection,toSunOnScreen));
  const roll=rad(12);
  const up=unit(add(scale(side,-Math.cos(roll)),
    scale(toSunOnScreen,Math.sin(roll))));
  const right=unit(cross(lookDirection,up));
  return {normal,up,right,lookDirection,distance,earthLimbAngleRad,
    sunCenterSeparationRad,compositionOffsetRad,
    daylightFractionApprox:(1+dot(normal,solar))/2,
    frameKind:"CUPOLA_EARTH_FIXED_WIDE_ORBIT_CAMERA",
    shot:"wide",distanceEarthRadii:4.15};
}


/**
 * CUPOLA 8.9 — homepage-only distant dawn/night composition.
 * Replaces the homepage iframe's near-surface 1.56R camera, NOT the
 * science-preset capture, normal Explore camera or lunar/orbital controls.
 * The night/day boundary is calculated by the actual Sun direction. Real
 * VIIRS/Black Marble radiance already exists in the independent night layer;
 * this camera never paints, amplifies or invents city lights.
 */
export function editorialTwilightHeroCamera(earthFixedSunWorldDirection,earthRadius){
  const solar=unit(earthFixedSunWorldDirection);
  if(!Number.isFinite(earthRadius)||earthRadius<=0)throw Error("Invalid Earth radius");
  const distance=earthRadius*4.30;
  const earthLimbAngleRad=Math.asin(earthRadius/distance);
  const illuminatedFraction=0.40;
  // Earthside observer sees 40% daylit surface and 60% night in this
  // approximate geometric phase metric, without changing solar ephemerides.
  const sunCenterSeparationRad=Math.acos(1-2*illuminatedFraction);
  const axis=Math.abs(solar.y)>0.97?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const north=unit(add(axis,scale(solar,-dot(axis,solar))));
  const east=unit(cross(axis,solar));
  const tangentAxis=unit(add(scale(east,0.91),scale(north,0.25)));
  const normal=unit(add(scale(solar,-Math.cos(sunCenterSeparationRad)),
    scale(tangentAxis,Math.sin(sunCenterSeparationRad))));
  const lookDirection=scale(normal,-1); // Center the real globe; no huge clipped arc.
  const toSunOnScreen=unit(add(solar,scale(lookDirection,-dot(solar,lookDirection))));
  const side=unit(cross(lookDirection,toSunOnScreen));
  const roll=rad(13);
  const up=unit(add(scale(side,-Math.cos(roll)),
    scale(toSunOnScreen,Math.sin(roll))));
  const right=unit(cross(lookDirection,up));
  return {
    normal,up,right,lookDirection,distance,earthLimbAngleRad,
    sunCenterSeparationRad,compositionOffsetRad:0,
    daylightFractionApprox:(1+dot(normal,solar))/2,
    frameKind:"CUPOLA_EARTH_FIXED_TWILIGHT_HERO_CAMERA",
    shot:"twilight",distanceEarthRadii:4.30
  };
}


/**
 * CUPOLA 8.10 — optically honest Earth + real Sun for the wide desktop hero.
 *
 * The Sun is ~67 degrees away from the center of the Earth disk for an
 * observer seeing 30% of the sunlit hemisphere, so it cannot possibly fit
 * with the previous 41-degree field of view. Use a 116-degree wide desktop lens,
 * aim only 10 degrees away from the Earth center towards the physical Sun,
 * and move the camera to 1.65R so city lights and sunrise remain recognizable.
 * No displaced/fake solar billboard, false flare or Earth texture changes.
 * Narrow/mobile screens continue using the conservative 8.9 camera.
 */
export function editorialSolarTwilightHeroCamera(earthFixedSunWorldDirection,earthRadius){
  const solar=unit(earthFixedSunWorldDirection);
  if(!Number.isFinite(earthRadius)||earthRadius<=0)throw Error("Invalid Earth radius");
  const distance=earthRadius*1.65;
  const earthLimbAngleRad=Math.asin(earthRadius/distance);
  const illuminatedFraction=0.30; // substantial observed night/city lights
  const sunCenterSeparationRad=Math.acos(1-2*illuminatedFraction);
  const axis=Math.abs(solar.y)>0.97?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const north=unit(add(axis,scale(solar,-dot(axis,solar))));
  const east=unit(cross(axis,solar));
  const tangentAxis=unit(add(scale(east,0.91),scale(north,0.25)));
  const normal=unit(add(scale(solar,-Math.cos(sunCenterSeparationRad)),
    scale(tangentAxis,Math.sin(sunCenterSeparationRad))));
  const earthForward=scale(normal,-1);
  const towardSun=unit(add(solar,scale(earthForward,-dot(solar,earthForward))));
  const compositionOffsetRad=rad(10);
  const lookDirection=unit(add(scale(earthForward,Math.cos(compositionOffsetRad)),
    scale(towardSun,Math.sin(compositionOffsetRad))));
  const sunOnScreen=unit(add(solar,scale(lookDirection,-dot(solar,lookDirection))));
  const side=unit(cross(lookDirection,sunOnScreen));
  const roll=rad(6);
  const up=unit(add(scale(side,-Math.cos(roll)),scale(sunOnScreen,Math.sin(roll))));
  const right=unit(cross(lookDirection,up));
  return {
    normal,up,right,lookDirection,distance,earthLimbAngleRad,
    sunCenterSeparationRad,compositionOffsetRad,
    daylightFractionApprox:(1+dot(normal,solar))/2,
    frameKind:"CUPOLA_EARTH_FIXED_SOLAR_TWILIGHT_HERO_CAMERA",
    shot:"solar-twilight",distanceEarthRadii:1.65,
    verticalFovDegrees:116
  };
}
