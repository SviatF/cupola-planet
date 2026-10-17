/** CUPOLA Solar Cinematic: an angularly-sized HDR Sun, not a second light source.
 * NASA-style photometric impression; synthetic corona, not a live solar image.
 * The existing getSunDirection remains the only source for the actual sun vector.
 */
export const SOLAR_ANGULAR_RADIUS_RAD = 0.266 * Math.PI / 180;
export const SOLAR_CORE_RADIUS_UV = 0.082;
export const SOLAR_VIEW_CAMERA_DISTANCE = 10.3;
export const SOLAR_VIEW_LIMB_ANGLE_RAD = 40.5 * Math.PI / 180;

export function solarBillboardWorldRadius(cameraDistance: number): number {
  if (!Number.isFinite(cameraDistance) || cameraDistance <= 0) return 0;
  // The radius of the white disc subtends ~0.53 deg from the camera regardless
  // of zoom; the procedural corona can stretch well beyond that angular core.
  return cameraDistance * Math.tan(SOLAR_ANGULAR_RADIUS_RAD) / SOLAR_CORE_RADIUS_UV;
}

// Vertex/fragment shader use no procedural flicker, animation, or fake flares
// independent of the visible Sun. Earth depth-test fully occludes the Sun.
export const SOLAR_VERTEX_SHADER = `
  varying vec2 vSolarUv;
  void main() {
    vSolarUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SOLAR_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vSolarUv;
  uniform float uGaze;
  void main() {
    vec2 p = vSolarUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    // Angular disc stays crisp; never an orange cartoon ball.
    float disc = 1.0 - smoothstep(0.078, 0.086, r);
    float hotCenter = exp(-pow(r / 0.042, 2.0));
    float coronalR = max(0.0, r - 0.078);
    float corona = exp(-coronalR * 13.0) * (1.0 - disc);
    float outer = exp(-r * 5.7) * (1.0 - disc);
    // Subtle instrumental diffraction only as the camera points at the sun.
    float axis = (exp(-abs(p.x) * 44.0) + exp(-abs(p.y) * 44.0));
    float diagonal = exp(-abs(p.x - p.y) * 36.0) + exp(-abs(p.x + p.y) * 36.0);
    float rays = (axis + diagonal * 0.32) * exp(-r * 7.4) * uGaze;
    vec3 white = vec3(1.0, 1.02, 1.08);
    vec3 warm = vec3(1.0, 0.85, 0.62);
    vec3 radiance = white * (disc * 9.0 + hotCenter * 1.8);
    radiance += mix(white, warm, smoothstep(0.08, 0.5, r)) *
      (corona * 1.3 + outer * (0.43 + uGaze * 0.27));
    radiance += warm * rays * 0.22;
    float opacity = clamp(disc + corona * 0.86 + outer * 0.45 + rays * 0.25, 0.0, 1.0);
    // HDR output is deliberately managed by CUPOLA's existing single-pass
    // bloom; there is no second EffectComposer or scene-wide exposure flash.
    gl_FragColor = vec4(min(radiance, vec3(14.0)), opacity);
  }
`;
