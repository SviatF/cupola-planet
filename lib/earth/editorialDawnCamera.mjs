/**
 * CUPOLA 8.0 — physically sunlit dawn for the Atlas cover.
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
  const distance=earthRadius*1.40;
  const earthLimbAngleRad=Math.asin(earthRadius/distance);

  // Photometric geometrical constraint: camera normal's Sun dot must be
  // -0.24 (38% of visible hemisphere approximately daylit) versus -0.696
  // (15.2% daylit) for classic. This is a REAL Sun/observer geometry change,
  // not cloud shader exposure. Twilight remains visible with the terminator.
  const isClassic=shot==="classic";
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
  const compositionOffsetRad=rad(isClassic?37:54);
  const lookDirection=unit(add(scale(earthForward,Math.cos(compositionOffsetRad)),
    scale(towardSun,Math.sin(compositionOffsetRad))));
  const toSunOnScreen=unit(add(solar,scale(lookDirection,-dot(solar,lookDirection))));
  const side=unit(cross(lookDirection,toSunOnScreen));
  const roll=rad(isClassic?54:25);
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
