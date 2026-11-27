// Screenshot presets — ?shot=<name>&seed=1 puts the game in a fixed,
// good-looking state so screenshots are genuine renders of the game code:
//   start    title screen over the dawn ridge
//   hero     Relief Drop on the approach: last gate ahead, runway lit behind it
//   cockpit  Night Intercept from the cockpit: lit panel, beacons, runway lamps
//   storm    mid-flight in Stormfront, rain + lightning
//   night    mid-flight in Night Intercept, beacons lit
//   complete mission-complete screen with a gold medal (Stormfront)
// warmupDist steps the autopilot until the jet reaches that distance, so a
// preset frames a specific moment (the approach gate) instead of a time.
// The game exposes window.__emberwing = { state, startMission } so a
// screenshot driver can also drive it directly.
export const SHOT_PRESETS = {
  start: { screen: 'menu', mission: 0 },
  hero: { screen: 'fly', mission: 2, autopilot: true, warmupDist: 13500, cockpit: false },
  cockpit: { screen: 'fly', mission: 4, autopilot: true, warmupDist: 15400, cockpit: true },
  storm: { screen: 'fly', mission: 3, autopilot: true, warmup: 10 },
  night: { screen: 'fly', mission: 4, autopilot: true, warmup: 12 },
  complete: { screen: 'complete', mission: 3, medal: 'gold', time: 61.1 },
};

export function parseShot(search) {
  const q = new URLSearchParams(search || '');
  const name = q.get('shot');
  if (!name || !SHOT_PRESETS[name]) return null;
  return { name, ...SHOT_PRESETS[name], seed: Number(q.get('seed') || 1) };
}
