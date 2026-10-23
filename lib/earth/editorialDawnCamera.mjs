/**
 * CUPOLA 7.1 — science-led editorial sunrise camera.
 * Input is the SAME Earth-fixed geocentric Sun direction that drives the
 * terrestrial terminator, solar billboard and Earth atmosphere in the scene.
 *
 * No separate civil-clock dawn approximation, fake second Sun or frozen
 * North America geometry. The camera alone changes; source pixels do not.
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
 * Wide-screen editorial Earth limb: a mostly night-side, shallow daylit
 * crescent with the ACTUAL Sun just above Earth's apparent limb.
 * Distance = scene units from Earth's centre, not metres of physical altitude.
 * Orbit/scene planet radius and Sun direction remain unchanged.
 *
 * @param {{x:number,y:number,z:number}} earthFixedSunWorldDirection
 * @param {number} earthRadius
 * @returns {{ normal:{x:number,y:number,z:number},
 *   up:{x:number,y:number,z:number},
 *   right:{x:number,y:number,z:number},
 *   distance:number,earthLimbAngleRad:number,sunCenterSeparationRad:number,
 *   daylightFractionApprox:number,frameKind:string }}
 */
export function editorialDawnCamera(earthFixedSunWorldDirection,earthRadius){
  const solar=unit(earthFixedSunWorldDirection);
  if(!Number.isFinite(earthRadius)||earthRadius<=0)throw Error("Invalid Earth radius");
  // Deliberately larger than Explore's distant full-globe view.
  // A radius/distance ratio of ~0.45 gives a strongly cropped orbit panorama.
  const distance=earthRadius*2.18;
  const earthLimbAngleRad=Math.asin(earthRadius/distance);
  const sunCenterSeparationRad=earthLimbAngleRad+rad(0.88);
  // Choose a stable north-biased dawn limb; never follow a fixed continent.
  const axis=Math.abs(solar.y)>0.97?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const tangentAxis=unit(add(axis,scale(solar,-dot(axis,solar))));
  const normal=unit(add(scale(solar,-Math.cos(sunCenterSeparationRad)),
    scale(tangentAxis,Math.sin(sunCenterSeparationRad))));
  const forward=scale(normal,-1);
  const toSunOnScreen=unit(add(solar,scale(normal,-dot(solar,normal))));
  const side=unit(cross(forward,toSunOnScreen));
  // A deliberate 54° photographic bank puts the REAL Sun toward the
  // upper-right while preserving a visible twilight edge / city lights.
  const roll=rad(54);
  const up=unit(add(scale(side,-Math.cos(roll)),
    scale(toSunOnScreen,Math.sin(roll))));
  const right=unit(cross(forward,up));
  const sunDotView=dot(solar,forward);
  return {
    normal,up,right,distance,earthLimbAngleRad,sunCenterSeparationRad,
    daylightFractionApprox:(1-sunDotView)/2,
    frameKind:"CUPOLA_EARTH_FIXED_DAWN_CAMERA"
  };
}
