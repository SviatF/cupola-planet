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
 * @param {"daylit"|"classic"|"clouds"|"terminator"|"nightlights"} [shot] capture-only variants never affect homepage camera
 */
export function editorialDawnCamera(earthFixedSunWorldDirection,earthRadius,shot="daylit"){
  const solar=unit(earthFixedSunWorldDirection);
  if(!Number.isFinite(earthRadius)||earthRadius<=0)throw Error("Invalid Earth radius");
  if(!["daylit","classic","clouds","terminator","nightlights"].includes(shot))
    throw Error("Unknown editorial camera shot");
  // The three additional shots are allowed ONLY on the capture route;
  // the site always uses the original daylit camera. No second Sun or
  // invented imagery is involved; we only change the observer location.
  const mediaPreset={
    clouds:{distance:1.85,day:0.63,offset:9,roll:17,northWeight:0.18},
    terminator:{distance:2.03,day:0.49,offset:12,roll:31,northWeight:0.58},
    nightlights:{distance:1.90,day:0.15,offset:6,roll:12,northWeight:-0.16}
  }[shot]??null;
  // The daylit 8.0 shot was too tight: distance 1.40 R with a steeply
  // diagonal limb. Move only the editorial daylit camera back by ~11%.
  // Keep classic as a reproducible A/B baseline and preserve the actual
  // UTC solar direction and cloud observations in both variants.
  const isClassic=shot==="classic";
  const distance=earthRadius*(isClassic?1.40:1.56);
  const activeDistance=mediaPreset?earthRadius*mediaPreset.distance:distance;
  const earthLimbAngleRad=Math.asin(earthRadius/activeDistance);

  // Photometric geometrical constraint: camera normal's Sun dot must be
  // -0.24 (38% of visible hemisphere approximately daylit) versus -0.696
  // (15.2% daylit) for classic. This is a REAL Sun/observer geometry change,
  // not cloud shader exposure. Twilight remains visible with the terminator.
  const sunCenterSeparationRad=mediaPreset
    ? Math.acos(1-2*mediaPreset.day)
    : (isClassic ? earthLimbAngleRad+rad(0.88) : Math.acos(1-2*0.38));

  // Stable north-biased tangential orbit, no locked geography.
  const axis=Math.abs(solar.y)>0.97?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const north=unit(add(axis,scale(solar,-dot(axis,solar))));
  // Geostationary Arctic framing kept the camera near the pole as the Sun
  // moved. The NEW cover follows the sunrise around inhabited/tropical
  // longitudes: eastward tangential motion with a modest northward bank.
  const tangentAxis=mediaPreset
    ? unit(add(scale(unit(cross(axis,solar)),1),scale(north,mediaPreset.northWeight)))
    : (isClassic?north:unit(add(scale(unit(cross(axis,solar)),0.86),scale(north,0.32))));
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
  const actualOffset=mediaPreset?rad(mediaPreset.offset):compositionOffsetRad;
  const lookDirection=unit(add(scale(earthForward,Math.cos(actualOffset)),
    scale(towardSun,Math.sin(actualOffset))));
  const toSunOnScreen=unit(add(solar,scale(lookDirection,-dot(solar,lookDirection))));
  const side=unit(cross(lookDirection,toSunOnScreen));
  const roll=rad(isClassic?54:22);
  const actualRoll=mediaPreset?rad(mediaPreset.roll):roll;
  const up=unit(add(scale(side,-Math.cos(actualRoll)),
    scale(toSunOnScreen,Math.sin(actualRoll))));
  const right=unit(cross(lookDirection,up));
  const sunDotView=dot(solar,earthForward);
  return {
    normal,up,right,lookDirection,distance:activeDistance,earthLimbAngleRad,
    sunCenterSeparationRad,compositionOffsetRad:actualOffset,
    daylightFractionApprox:(1-sunDotView)/2,
    frameKind:"CUPOLA_EARTH_FIXED_DAWN_CAMERA",
    shot
  };
}
