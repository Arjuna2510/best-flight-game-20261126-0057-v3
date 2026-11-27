// EMBERWING v3 — mission data and world tuning.
// One place holds every number the flight model, the autopilot and the
// renderer agree on, so a mission the sim can finish is a mission the
// player can finish too. Speeds are metres per second, altitudes metres,
// distances metres; the HUD converts to knots and feet for display.

// --- the world the jet flies in -------------------------------------------
export const WORLD = {
  halfWidth: 700, // the valley walls: |x| never passes this
  maxAlt: 700, // the ceiling: y clamps to [0, maxAlt]
  ringRadius: 55, // a gate's hit radius (canyon gates run 8% tighter)
  cloudMinR: 60, // smallest storm cell
  cloudMaxR: 130, // largest storm cell
  baseSpeed: 130, // cruise at idle throttle
  speedPerThrottle: 170, // +170 m/s from idle to full throttle
  maxSteer: 95, // fastest sideways speed, m/s
  maxClimb: 75, // fastest climb / sink, m/s
  fuelDrain: 0.0035, // fuel per second at full throttle, scaled by throttle^2
  fuelPerRing: 0.02, // fuel refunded for threading a gate
  cloudDamage: 7, // hull lost for flying through a storm cell
  missionTimeLimit: 320, // seconds; the window closes after this
};

// --- the campaign ----------------------------------------------------------
// length is the strip: landing missions end on the runway at `length`,
// and the final gate sits 900 m before it, low on the centreline, so the
// glide threads it on the way to touchdown. ringGap is the spacing
// between gates; parGold/parSilver are the medal times in seconds.
export const MISSIONS = [
  {
    id: 'dawn',
    name: 'Dawn Patrol',
    seed: 11,
    rings: 12,
    ringGap: [520, 760],
    length: 9500,
    clouds: 6,
    turbulence: 0,
    landing: true,
    parGold: 45,
    parSilver: 55,
    sky: 'dawn',
    brief: 'First light over the valley. Thread all twelve gates and bring her home on the strip.',
  },
  {
    id: 'canyon',
    name: 'Canyon Rush',
    seed: 23,
    rings: 16,
    ringGap: [480, 720],
    length: 11500,
    clouds: 8,
    canyon: true,
    turbulence: 0.08,
    landing: true,
    parGold: 55,
    parSilver: 65,
    sky: 'canyon',
    brief: 'Down between the walls. The gates are tighter here — stay off the rock and off the river.',
  },
  {
    id: 'relief',
    name: 'Relief Drop',
    seed: 37,
    rings: 8,
    ringGap: [900, 1300],
    length: 15000,
    clouds: 10,
    drops: 3,
    turbulence: 0.1,
    landing: true,
    parGold: 60,
    parSilver: 75,
    sky: 'relief',
    brief: 'Three villages are waiting on the ground. Drop low over each one, then land with the last of the light.',
  },
  {
    id: 'storm',
    name: 'Stormfront',
    seed: 41,
    rings: 18,
    ringGap: [550, 800],
    length: 14000,
    clouds: 16,
    turbulence: 0.22,
    landing: true,
    parGold: 65,
    parSilver: 80,
    sky: 'storm',
    brief: 'Fly the front itself. Cells everywhere, the air shoving you sideways — slide around them, never through.',
  },
  {
    id: 'night',
    name: 'Night Intercept',
    seed: 53,
    rings: 10,
    ringGap: [1100, 1500],
    length: 17200,
    clouds: 8,
    beacons: 4,
    turbulence: 0.06,
    landing: true,
    parGold: 70,
    parSilver: 85,
    sky: 'night',
    brief: 'Moonlight, beacons and a black valley. Light all four beacons, thread the gates, land by the lamps.',
  },
];

// Endless practice: sixty gates out to the horizon, no strip, no clock
// pressure beyond the mission limit. Finishing is the medal.
export const FREE_FLIGHT = {
  id: 'free',
  name: 'Free Flight',
  seed: 67,
  rings: 60,
  ringGap: [700, 1100],
  length: 60000,
  clouds: 0,
  turbulence: 0,
  landing: false,
  parGold: 0,
  parSilver: 0,
  sky: 'dawn',
  brief: 'No strip, no clock. Sixty gates out to the horizon — fly them all.',
};

// Merits a medal is worth in the hangar.
export const MEDAL_MERITS = { gold: 3, silver: 2, bronze: 1 };

// Hangar upgrades: each level costs merits, each level makes the jet
// tangibly better. Costs are per level (level 1 costs costs[0]).
export const UPGRADES = {
  engine: { name: 'Engine', max: 3, costs: [2, 3, 4], blurb: '+8% speed per level' },
  tanks: { name: 'Drop Tanks', max: 2, costs: [2, 3], blurb: '+20% fuel per level' },
  armor: { name: 'Armor', max: 2, costs: [2, 3], blurb: '+25 hull per level' },
  handling: { name: 'Handling', max: 3, costs: [2, 3, 4], blurb: '+12% agility per level' },
};

// Pilot ranks, by lifetime merits earned.
export const RANKS = [
  { merits: 0, name: 'Rookie' },
  { merits: 4, name: 'Wingman' },
  { merits: 9, name: 'Flight Lead' },
  { merits: 15, name: 'Ace' },
  { merits: 24, name: 'EMBERWING' },
];

// --- skies: one palette per mission, the renderer paints from these ------
export const SKIES = {
  dawn: {
    top: '#2c4a7c', horizon: '#f2a35e', ground: '#5d4a33', groundFar: '#7a5c40',
    ridgeFar: '#6b5a78', ridgeNear: '#3d3348', sun: '#ffd9a0', sunX: 0.72, sunY: 0.30,
    night: false, stars: false, moon: false, rain: false,
  },
  canyon: {
    top: '#7fb2d9', horizon: '#cfe3ee', ground: '#8a6a4a', groundFar: '#a08055',
    ridgeFar: '#9a7a5c', ridgeNear: '#6b4a30', sun: '#fff3c4', sunX: 0.25, sunY: 0.22,
    night: false, stars: false, moon: false, rain: false,
  },
  relief: {
    top: '#3a6ea8', horizon: '#e8b06a', ground: '#6d5a3a', groundFar: '#8a744c',
    ridgeFar: '#5d6a86', ridgeNear: '#3a4258', sun: '#ffe0a8', sunX: 0.30, sunY: 0.34,
    night: false, stars: false, moon: false, rain: false,
  },
  storm: {
    top: '#1c2436', horizon: '#4a5568', ground: '#3a3a30', groundFar: '#4c4a3c',
    ridgeFar: '#2e3444', ridgeNear: '#1e2230', sun: '#c8d2e0', sunX: 0.68, sunY: 0.18,
    night: false, stars: false, moon: false, rain: true,
  },
  night: {
    top: '#05070f', horizon: '#1a2340', ground: '#14161e', groundFar: '#1e2230',
    ridgeFar: '#12162a', ridgeNear: '#0a0d1a', sun: '#f4f1de', sunX: 0.78, sunY: 0.20,
    night: true, stars: true, moon: true, rain: false,
  },
};
