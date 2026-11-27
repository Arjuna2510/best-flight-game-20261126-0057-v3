// EMBERWING v3 — mission and world tuning.
// Same proven flight numbers as v2 (autopilot-verified 6/6). v3 changes:
// the final ring of a landing mission now sits on the approach, 900 m
// before the strip, low (y ≈ 120) — thread the last gate, then land.
// That is what the hero screenshot frames: ring + runway in one view.
export const WORLD = {
  halfWidth: 420, // lateral meters, -420..420
  maxAlt: 520, // meters
  groundY: 0,
  ringRadius: 75,
  cloudMinR: 80,
  cloudMaxR: 150,
  baseSpeed: 150, // m/s at throttle 0
  speedPerThrottle: 170, // +m/s at throttle 1
  maxSteer: 120, // lateral m/s at full stick
  maxClimb: 75, // vertical m/s at full stick
  fuelDrain: 0.0038, // per second at throttle 0.7 (scales with throttle^2)
  fuelPerRing: 0.02,
  cloudDamage: 14,
  missionTimeLimit: 300, // seconds
};

export const UPGRADES = {
  engine: { name: 'Afterburner Mk II', desc: '+8% top speed per level', max: 3, costs: [2, 3, 4], apply: (u) => ({ speedMult: 1 + 0.08 * u }) },
  tanks: { name: 'Drop Tanks', desc: '+20% fuel per level', max: 3, costs: [2, 3, 4], apply: (u) => ({ fuelMult: 1 + 0.2 * u }) },
  armor: { name: 'Titanium Skin', desc: '+25 hull per level', max: 3, costs: [2, 3, 4], apply: (u) => ({ hullBonus: 25 * u }) },
  handling: { name: 'Fly-by-Wire', desc: '+12% turn & climb per level', max: 3, costs: [2, 3, 4], apply: (u) => ({ handlingMult: 1 + 0.12 * u }) },
};

export const MEDAL_MERITS = { gold: 3, silver: 2, bronze: 1 };

// Sky palettes per mission: [top, mid, horizon, sun color, fog color]
export const PALETTES = {
  dawn: {
    skyTop: '#2b3a67', skyMid: '#e8825a', skyHorizon: '#ffd9a0',
    sun: '#ffdf9e', sunX: 0.72, sunY: 0.30,
    far: '#6d5a8e', mid: '#4a3f66', near: '#2e2a44',
    ground: '#3d3350', groundLine: '#584a72', river: '#e8a56b',
    cloud: 'rgba(255, 214, 170, 0.85)', cloudShadow: 'rgba(90, 60, 110, 0.35)',
    stars: 0, rain: false, fog: 0.10,
  },
  noon: {
    skyTop: '#1e6fd9', skyMid: '#6db3f2', skyHorizon: '#cfe9ff',
    sun: '#fff7c0', sunX: 0.25, sunY: 0.18,
    far: '#7fa8c9', mid: '#5d8a6b', near: '#3f6b4a',
    ground: '#4a7a45', groundLine: '#6b9a5e', river: '#7fc4e8',
    cloud: 'rgba(255, 255, 255, 0.92)', cloudShadow: 'rgba(70, 110, 90, 0.25)',
    stars: 0, rain: false, fog: 0.08,
  },
  dusk: {
    skyTop: '#3a1f4d', skyMid: '#c94f5e', skyHorizon: '#ffb37a',
    sun: '#ff9e5e', sunX: 0.5, sunY: 0.42,
    far: '#5e3a5e', mid: '#46304e', near: '#2c2138',
    ground: '#3a2f42', groundLine: '#54455a', river: '#e88a5a',
    cloud: 'rgba(255, 170, 130, 0.8)', cloudShadow: 'rgba(60, 30, 60, 0.4)',
    stars: 0.25, rain: false, fog: 0.12,
  },
  storm: {
    skyTop: '#1c2233', skyMid: '#4a4a63', skyHorizon: '#8a7f8a',
    sun: '#d8d2c0', sunX: 0.6, sunY: 0.22,
    far: '#3d3d52', mid: '#2f2f42', near: '#232333',
    ground: '#2c2c38', groundLine: '#44445a', river: '#6a7a8a',
    cloud: 'rgba(40, 38, 55, 0.95)', cloudShadow: 'rgba(10, 10, 20, 0.5)',
    stars: 0, rain: true, fog: 0.22, lightning: true,
  },
  night: {
    skyTop: '#050816', skyMid: '#0d1533', skyHorizon: '#2a2a55',
    sun: '#e8ecff', sunX: 0.8, sunY: 0.16,
    far: '#1c2340', mid: '#141a30', near: '#0d1122',
    ground: '#12162a', groundLine: '#232a4a', river: '#3a4a7a',
    cloud: 'rgba(90, 100, 160, 0.7)', cloudShadow: 'rgba(5, 8, 20, 0.5)',
    stars: 1, rain: false, fog: 0.18, moon: true,
  },
};

export const MISSIONS = [
  {
    id: 'dawn-patrol', name: 'Dawn Patrol', num: 1,
    briefing: 'First light over the Ember Ridge. Thread 12 rings to shake the dawn dew off your wings. Calm air — learn the jet, earn your wings.',
    palette: 'dawn', seed: 11, length: 13000, rings: 12,
    clouds: 0, turbulence: 0, rain: false,
    drops: 0, landing: false, night: false,
    parGold: 62, parSilver: 82, ringGap: [750, 1150],
  },
  {
    id: 'canyon-rush', name: 'Canyon Rush', num: 2,
    briefing: 'The canyon narrows and the wind picks up. 16 gates, low and fast, storm cells drifting across the gap. Keep it tight, keep it alive.',
    palette: 'noon', seed: 23, length: 17000, rings: 16,
    clouds: 6, turbulence: 0.25, rain: false,
    drops: 0, landing: false, night: false, canyon: true,
    parGold: 78, parSilver: 102, ringGap: [700, 1050],
  },
  {
    id: 'relief-drop', name: 'Relief Drop', num: 3,
    briefing: 'Three villages cut off by the flood. Fly 8 rings to the drop corridor, release a crate over each village — low and slow — then thread the last gate and put her down on the strip.',
    palette: 'dusk', seed: 37, length: 15000, rings: 8,
    clouds: 3, turbulence: 0.15, rain: false,
    drops: 3, landing: true, night: false,
    parGold: 92, parSilver: 120, ringGap: [750, 1100],
  },
  {
    id: 'stormfront', name: 'Stormfront', num: 4,
    briefing: 'The front is here. 18 rings inside a living storm — rain, gusts, lightning, and cloud walls you cannot fly through. This is the one they write songs about.',
    palette: 'storm', seed: 51, length: 19000, rings: 18,
    clouds: 10, turbulence: 0.6, rain: true,
    drops: 0, landing: false, night: false,
    parGold: 96, parSilver: 126, ringGap: [700, 1050],
  },
  {
    id: 'night-intercept', name: 'Night Intercept', num: 5,
    briefing: 'Last one. Four beacons burning in the dark, ten rings between them, a last gate on the approach, and a strip lit by a single row of lamps. Land it, and you are an Ace.',
    palette: 'night', seed: 67, length: 17000, rings: 10,
    clouds: 4, turbulence: 0.2, rain: false,
    drops: 0, landing: true, night: true, beacons: 4,
    parGold: 102, parSilver: 132, ringGap: [800, 1150],
  },
];

export const FREE_FLIGHT = {
  id: 'free-flight', name: 'Free Flight', num: 0,
  briefing: 'No briefing. No clock. Rings as far as the fuel lasts — every ring tops the tanks up a little. How far can you go?',
  palette: 'noon', seed: 99, length: 60000, rings: 60,
  clouds: 8, turbulence: 0.2, rain: false,
  drops: 0, landing: false, night: false,
  parGold: 0, parSilver: 0, ringGap: [750, 1100],
};

// Pilot ranks by total merits earned across the campaign.
export const RANKS = [
  { merits: 0, name: 'Cadet' },
  { merits: 3, name: 'Pilot' },
  { merits: 6, name: 'Flight Lead' },
  { merits: 10, name: 'Ace' },
  { merits: 14, name: 'Storm Legend' },
];

export function rankFor(merits) {
  let r = RANKS[0];
  for (const cand of RANKS) if (merits >= cand.merits) r = cand;
  return r;
}
