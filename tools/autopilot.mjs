// Autopilot verification — runs every mission with the autopilot and
// reports whether the course is winnable, with time, rings, hull and medal.
// The sim imports the exact modules the browser game runs (flight.js,
// autopilot.js, config.js), so a pass here is a pass in the game.
// Usage: node tools/autopilot.mjs [--upgrades engine=1,tanks=1]
import { MISSIONS, FREE_FLIGHT, MEDAL_MERITS } from '../game/src/config.js';
import { newState, step, medalFor } from '../game/src/flight.js';
import { autopilotInput } from '../game/src/autopilot.js';
import { mulberry32 } from '../game/src/rng.js';

function parseUpgrades(argv) {
  const out = {};
  const i = argv.findIndex((a) => a === '--upgrades' || a.startsWith('--upgrades='));
  if (i === -1) return out;
  // two forms: "--upgrades k=v,k=v" (value is the next argv entry) and
  // "--upgrades=k=v,k=v" (value glued to the flag)
  const spec = argv[i].startsWith('--upgrades=') ? argv[i].slice('--upgrades='.length) : argv[i + 1] || '';
  for (const pair of spec.split(',')) {
    const [k, v] = pair.split('=');
    if (k && v) out[k.trim()] = Number(v);
  }
  return out;
}

function runMission(mission, upgrades) {
  const s = newState(mission, upgrades);
  const rng = mulberry32(mission.seed * 7 + 3);
  const dt = 1 / 60;
  let steps = 0;
  const maxSteps = 60 * 320;
  while (s.status === 'flying' && steps < maxSteps) {
    const inp = autopilotInput(s, dt);
    step(s, inp, dt, rng);
    steps++;
  }
  return {
    id: mission.id,
    name: mission.name,
    status: s.status,
    reason: s.reason,
    time: Math.round(s.time * 10) / 10,
    rings: `${s.ringsHit}/${s.course.rings.length}`,
    drops: mission.drops ? `${s.dropsDone}/${mission.drops}` : '-',
    beacons: mission.beacons ? `${s.beaconsLit}/${mission.beacons}` : '-',
    hull: Math.round(s.hull),
    fuel: Math.round(s.fuel * 100) / 100,
    medal: medalFor(mission, s),
    parGold: mission.parGold,
    parSilver: mission.parSilver,
  };
}

const upgrades = parseUpgrades(process.argv.slice(2));
const missions = [...MISSIONS, FREE_FLIGHT];
const results = [];
let pass = 0;
for (const m of missions) {
  const r = runMission(m, upgrades);
  const ok = r.status === 'complete';
  if (ok) pass++;
  results.push(r);
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(16)} ${r.status.padEnd(12)} ` +
      `time ${String(r.time).padEnd(6)} rings ${r.rings.padEnd(6)} ` +
      `drops ${r.drops.padEnd(4)} beacons ${r.beacons.padEnd(4)} ` +
      `hull ${String(r.hull).padEnd(4)} fuel ${r.fuel} medal ${r.medal || '-'} ` +
      `${r.status !== 'complete' ? '(' + r.reason + ')' : ''}`,
  );
}
console.log(`\n${pass}/${results.length} missions winnable by autopilot` + (Object.keys(upgrades).length ? ` with upgrades ${JSON.stringify(upgrades)}` : ' (stock jet)'));
if (pass !== results.length) process.exit(1);
