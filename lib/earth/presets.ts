export type EarthRenderPreset = {
  exposure: number;
  bloomIntensity: number;
  bloomThreshold: number;
  bloomSmoothing: number;
  cloudOpacity: number;
  cloudBrightness: number;
  cloudContrast: number;
  oceanBlue: number;
  oceanFresnel: number;
  oceanGlint: number;
  daylightBoost: number;
  atmosphereDensity: number;
  atmosphereWarmth: number;
};

export const LIVE_PRESET: EarthRenderPreset = {
  exposure: 1.04,
  bloomIntensity: 0.18,
  bloomThreshold: 0.96,
  bloomSmoothing: 0.06,
  cloudOpacity: 0.23,
  cloudBrightness: 1.0,
  cloudContrast: 1.0,
  oceanBlue: 0.32,
  oceanFresnel: 0.22,
  oceanGlint: 0.18,
  daylightBoost: 1.0,
  atmosphereDensity: 0.78,
  atmosphereWarmth: 0.28,
};

export const CINEMA_PRESET: EarthRenderPreset = {
  exposure: 1.14,
  bloomIntensity: 0.31,
  bloomThreshold: 0.90,
  bloomSmoothing: 0.06,
  cloudOpacity: 0.48,
  cloudBrightness: 1.20,
  cloudContrast: 1.24,
  oceanBlue: 0.92,
  oceanFresnel: 0.72,
  oceanGlint: 0.52,
  daylightBoost: 1.16,
  atmosphereDensity: 0.98,
  atmosphereWarmth: 0.58,
};
