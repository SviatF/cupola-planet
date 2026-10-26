/**
 * Science eligibility for ORIGINAL CUPOLA 3D scene media.
 * This is a fail-closed gate, not an editorial approval or a claim that every
 * pixel of the globe comes from a current observation.
 */
const sha40=/^[a-f0-9]{40}$/;
const validDate=value=>typeof value==="string"&&Number.isFinite(Date.parse(value));
export function assessScienceCandidate(meta,{maxObservedAgeHours=24}={}){
  const issues=[];
  const require=(condition,reason)=>{if(!condition)issues.push(reason);};
  if(!meta||typeof meta!=="object")return {eligible:false,issues:["missing candidate metadata"]};
  require(meta.approved===false && meta.assetStatus==="AWAITING_EDITORIAL_AND_SCIENCE_REVIEW",
    "candidate must remain unapproved until a separately reviewed publication");
  require(meta.imageType==="CUPOLA_3D_RENDER_NOT_A_SATELLITE_PHOTOGRAPH",
    "CUPOLA 3D scene classification missing");
  require(meta.sceneReadyVerified===true && meta.actualThreeJsCanvas===true,
    "real Three.js WebGL render not verified");
  require(sha40.test(meta.sceneRevision||""),"production scene SHA not independently verified");
  require(sha40.test(meta.requestRevision||""),"capture workflow commit SHA missing");
  require(meta.sceneRevision===meta.requestRevision,
    "deployed Cloudflare revision differs from capture workflow revision");
  require(validDate(meta.renderedAt),"render UTC timestamp missing");
  require(typeof meta.heroSha256==="string"&&/^[a-f0-9]{64}$/.test(meta.heroSha256),
    "image checksum missing");
  require(typeof meta.ogSha256==="string"&&/^[a-f0-9]{64}$/.test(meta.ogSha256),
    "Open Graph image checksum missing");
  require(meta.viewport?.width===1600&&meta.viewport?.height===900,
    "expected full-size original frame missing");
  require(Array.isArray(meta.contrastStdev)&&meta.contrastStdev.some(x=>Number(x)>=8),
    "potentially empty or uniform image");
  const camera=meta.actualSceneCameraEvidence||{};
  require(camera.renderer==="CUPOLA_THREEJS_WEBGL","wrong or unconfirmed scene renderer");
  if(["home-hero","from-orbit-feature"].includes(meta.preset)){
    require(camera.cameraMode==="sunrise-limb-v1" && camera.solarDiscInsideFrustum===true,
      "solar camera was not verified for sunrise frame");
    require(validDate(camera.utcSolarFrame),"sun geometry UTC evidence missing");
  }
  const cloud=meta.cloudSourceEvidence||{};
  require(cloud.mode==="observed","Cloud V3 is fallback/visual/unreported, not verified observational");
  require(Number.isFinite(cloud.footprint)&&cloud.footprint>0&&cloud.footprint<=1,
    "observed satellite footprint not reported");
  require(cloud.gpuAppliedKind==="verified-l2",
    "verified Level-2 cloud atlas not confirmed on GPU");
  require(typeof cloud.gpuAtlasVersion==="string"&&cloud.gpuAtlasVersion.length>0,
    "applied Level-2 atlas version missing");
  require(validDate(cloud.observedAt),"source observation timestamp missing");
  require(validDate(cloud.gpuAppliedAt),"GPU application timestamp missing");
  if(validDate(meta.renderedAt)&&validDate(cloud.observedAt)){
    const ageHours=(Date.parse(meta.renderedAt)-Date.parse(cloud.observedAt))/3600000;
    require(ageHours>=-0.0833 && ageHours<=maxObservedAgeHours,
      "cloud observation outside verified freshness window");
  }
  if(validDate(meta.renderedAt)&&validDate(cloud.gpuAppliedAt)){
    require(Date.parse(cloud.gpuAppliedAt)<=Date.parse(meta.renderedAt)+300000,
      "GPU atlas application time postdates captured frame");
  }
  if(meta.requestType==="video"){
    require(meta.video?.classification==="CUPOLA_3D_SCENE_SIMULATION_NOT_OBSERVED_TIMELAPSE",
      "video is not labelled as scene simulation");
    require(Number(meta.video?.durationSeconds)>=7.5&&Number(meta.video?.durationSeconds)<=8.25,
      "expected 8-second video not verified");
    require(/^[a-f0-9]{64}$/.test(meta.video?.sha256||""),
      "video checksum missing");
  }
  return {eligible:issues.length===0,issues,
    classification:"REGIONAL_OBSERVATIONS_IN_3D_SCENE_NOT_A_LIVE_GLOBAL_PHOTOGRAPH",
    observedFootprint:Number(cloud.footprint)||0,
    observedAt:validDate(cloud.observedAt)?cloud.observedAt:null};
}
