// Pure flight model — no DOM, no canvas, no audio. The browser game and
// the Node autopilot sim run the exact same step() on the exact same state,
// so a sim win is a real win. v3 keeps v2's proven numbers; the only
// course change is the final ring of a landing mission, which now sits on
// the approach (900 m before the strip, low) instead of far up-course.
import { WORLD } from './config.js';
import { mulberry32, range } from './rng.js';

export function makeUpgrades(levels = {}) {
  const speedMult = 1 + 0.08 * (levels.engine || 0);
  const fuelMult = 1 + 0.2 * (levels.tanks || 0);
  const hullBonus = 25 * (levels.armor || 0);
  const handlingMult = 1 + 0.12 * (levels.handling || 0);
  return { speedMult, fuelMult, hullBonus, handlingMult };
}

// Build the mission's rings / clouds / drop zones / beacons from its seed.
// Deterministic: same mission + same seed = same course every time.
export function buildCourse(mission) {
  const rng = mulberry32(mission.seed);
  const rings = [];
  let d = 900;
  // Consecutive rings stay reachable: each one is at most ~260 m sideways
  // and ~170 m up/down from the last, so a jet at full stick can always
  // bend onto the next gate in the gap between them.
  let prevX = 0;
  let prevY = 240;
  for (let i = 0; i < mission.rings; i++) {
    const gap = range(rng, mission.ringGap[0], mission.ringGap[1]);
    d += gap;
    const wide = mission.canyon ? 0.62 : 1;
    const x = clamp(prevX + range(rng, -260, 260), -WORLD.halfWidth * wide, WORLD.halfWidth * wide);
    const y = clamp(prevY + range(rng, -170, 170), 90, WORLD.maxAlt - 60);
    rings.push({
      dist: d,
      x,
      y,
      r: WORLD.ringRadius * (mission.canyon ? 0.92 : 1),
      hit: false,
    });
    prevX = x;
    prevY = y;
  }
  if (mission.landing) {
    // Final gate on the approach: 900 m before the strip, centred low, so
    // the glide path threads it on the way to touchdown. The hero shot
    // frames this ring with the runway behind it. The ring is MOVED, not
    // regenerated, so the seeded stream (and therefore the clouds, drops
    // and beacons) stays exactly as v2 verified it.
    const last = rings[rings.length - 1];
    last.dist = mission.length - 900;
    last.x = 0; // on the centerline by design — the glide threads it
    last.y = 120;
  }
  const clouds = [];
  for (let i = 0; i < mission.clouds; i++) {
    clouds.push({
      dist: range(rng, 1200, mission.length - 800),
      x: range(rng, -WORLD.halfWidth, WORLD.halfWidth),
      y: range(rng, 90, WORLD.maxAlt - 40),
      r: range(rng, WORLD.cloudMinR, WORLD.cloudMaxR),
      hit: false,
    });
  }
  clouds.sort((a, b) => a.dist - b.dist);
  const drops = [];
  for (let i = 0; i < (mission.drops || 0); i++) {
    drops.push({
      dist: mission.length * (0.45 + 0.2 * i),
      x: range(rng, -220, 220),
      y: 0, // village on the ground; drop when low and close
      done: false,
    });
  }
  const beacons = [];
  for (let i = 0; i < (mission.beacons || 0); i++) {
    beacons.push({
      dist: mission.length * (0.25 + 0.18 * i),
      x: range(rng, -260, 260),
      y: range(rng, 120, 300),
      lit: false,
    });
  }
  return { rings, clouds, drops, beacons, length: mission.length };
}

export function newState(mission, upgrades) {
  const up = makeUpgrades(upgrades);
  return {
    mission,
    course: buildCourse(mission),
    up,
    x: 0, y: 220, vx: 0, vy: 0,
    speed: 0, throttle: 0,
    fuel: 1 * up.fuelMult, fuelMax: 1 * up.fuelMult,
    hull: 100 + up.hullBonus, hullMax: 100 + up.hullBonus,
    dist: 0, time: 0,
    ringsHit: 0, dropsDone: 0, beaconsLit: 0,
    status: 'flying', // flying | complete | crashed | out-of-fuel | timeout
    reason: '',
    shake: 0,
    nextRing: 0,
    landing: false, // true once in the landing corridor
    gustX: 0, gustY: 0,
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// One fixed step. input: { steer: -1..1, pitch: -1..1, throttle: 0..1,
// drop: bool }. rng is only used for turbulence gusts.
export function step(s, input, dt, rng) {
  if (s.status !== 'flying') return s;
  const W = WORLD;
  const m = s.mission;

  // --- turbulence gusts (storm pushes the jet around) ---
  if (m.turbulence > 0) {
    s.gustX += (rng() - 0.5) * m.turbulence * 90 * dt;
    s.gustY += (rng() - 0.5) * m.turbulence * 60 * dt;
    s.gustX = clamp(s.gustX, -38 * m.turbulence, 38 * m.turbulence);
    s.gustY = clamp(s.gustY, -26 * m.turbulence, 26 * m.turbulence);
  } else {
    s.gustX *= 0.9;
    s.gustY *= 0.9;
  }

  // --- controls ---
  const steer = clamp(input.steer || 0, -1, 1);
  const pitch = clamp(input.pitch || 0, -1, 1);
  s.throttle = clamp(input.throttle ?? 0.7, 0, 1);
  if (s.fuel <= 0) s.throttle = Math.min(s.throttle, 0.25);

  // gear + flaps drag in the landing corridor: the jet can actually slow
  // to touchdown speed instead of screaming past the strip at 200 m/s.
  // The drag scales with the engine upgrade, so a faster jet is still
  // landable — its minimum landing speed stays the stock ~116 m/s.
  const landingFactor = s.landing ? 0.62 / s.up.speedMult : 1;
  const targetSpeed = (W.baseSpeed + s.throttle * W.speedPerThrottle) * s.up.speedMult * landingFactor;
  s.speed += (targetSpeed - s.speed) * Math.min(1, dt * 0.9);
  s.vx = steer * W.maxSteer * s.up.handlingMult + s.gustX;
  s.vy = pitch * W.maxClimb * s.up.handlingMult + s.gustY;
  s.x = clamp(s.x + s.vx * dt, -W.halfWidth, W.halfWidth);
  s.y = clamp(s.y + s.vy * dt, 0, W.maxAlt);

  const prevDist = s.dist;
  s.dist += s.speed * dt;
  s.time += dt;

  // --- fuel ---
  s.fuel -= W.fuelDrain * (0.4 + s.throttle * s.throttle) * dt;
  if (s.fuel <= 0) {
    s.fuel = 0;
    if (s.speed < 60) {
      s.status = 'out-of-fuel';
      s.reason = 'Out of fuel — the jet glided down short of the line.';
      return s;
    }
  }

  // --- rings ---
  const course = s.course;
  for (let i = s.nextRing; i < course.rings.length; i++) {
    const r = course.rings[i];
    if (r.hit) continue;
    if (prevDist < r.dist && s.dist >= r.dist) {
      const dx = s.x - r.x;
      const dy = s.y - r.y;
      if (Math.hypot(dx, dy) <= r.r) {
        r.hit = true;
        s.ringsHit++;
        s.fuel = Math.min(s.fuelMax, s.fuel + W.fuelPerRing);
        s.nextRing = i + 1;
      } else {
        // missed ring: it stays behind, but the course goes on — the
        // mission can still finish, the medal is what suffers.
        s.nextRing = i + 1;
      }
    } else break;
  }

  // --- beacons (night): light when flown close ---
  for (const b of course.beacons) {
    if (!b.lit && prevDist < b.dist && s.dist >= b.dist) {
      if (Math.hypot(s.x - b.x, s.y - b.y) <= 130) {
        b.lit = true;
        s.beaconsLit++;
      }
    }
  }

  // --- drops: release over the village, low and close ---
  if (input.drop) {
    for (const d of course.drops) {
      if (!d.done && Math.abs(s.dist - d.dist) < 120 && Math.abs(s.x - d.x) < 140 && s.y < 220) {
        d.done = true;
        s.dropsDone++;
      }
    }
  }

  // --- clouds: flying through one hurts ---
  for (const c of course.clouds) {
    if (!c.hit && Math.abs(s.dist - c.dist) < 40) {
      if (Math.hypot(s.x - c.x, s.y - c.y) < c.r) {
        c.hit = true;
        s.hull -= W.cloudDamage;
        s.shake = 1;
        if (s.hull <= 0) {
          s.hull = 0;
          s.status = 'crashed';
          s.reason = 'Torn apart inside a storm cell.';
          return s;
        }
      }
    }
  }
  s.shake = Math.max(0, s.shake - dt * 1.6);

  // --- landing corridor ---
  // Approach starts 1800 m out (gear + flaps drag, glide begins); the
  // strip itself is the last 600 m. Touching down before the strip is a
  // crash, not a landing — the jet has to arrive ON the runway.
  if (m.landing) {
    const runwayStart = m.length - 600;
    const approachStart = m.length - 1800;
    if (s.dist >= approachStart && !s.landing) s.landing = true;
    if (s.landing) {
      if (s.y <= 2) {
        if (s.dist < runwayStart) {
          s.status = 'crashed';
          s.reason = 'Came down short of the runway.';
        } else if (s.speed <= 140) {
          s.status = 'complete';
          s.reason = 'Touchdown — wheels on the strip.';
        } else {
          s.status = 'crashed';
          s.reason = 'Too fast on touchdown — the gear collapsed.';
        }
        return s;
      }
      if (s.dist >= m.length + 300) {
        s.status = 'crashed';
        s.reason = 'Overshot the runway.';
        return s;
      }
    }
  }

  // --- ground ---
  if (s.y <= 0 && !s.landing) {
    s.status = 'crashed';
    s.reason = 'Controlled flight into terrain.';
    return s;
  }

  // --- finish ---
  // Non-landing missions end when the last ring is passed (hit or missed —
  // a missed ring costs the medal, not the mission). Landing missions end
  // on the runway: the touchdown above decides, not the objective count.
  if (!m.landing && s.nextRing >= course.rings.length) {
    s.status = 'complete';
    s.reason = 'Course complete.';
    return s;
  }

  if (s.time > W.missionTimeLimit) {
    s.status = 'timeout';
    s.reason = 'Out of time — the mission window closed.';
  }
  return s;
}

export function medalFor(mission, s) {
  if (s.status !== 'complete') return null;
  if (mission.parGold === 0) return 'bronze'; // free flight: finishing is the medal
  const objectivesDone =
    s.ringsHit === s.course.rings.length &&
    s.dropsDone >= (mission.drops || 0) &&
    s.beaconsLit >= (mission.beacons || 0);
  const ringRate = s.course.rings.length ? s.ringsHit / s.course.rings.length : 1;
  if (s.time <= mission.parGold && s.hull >= s.hullMax * 0.9 && objectivesDone) return 'gold';
  if (s.time <= mission.parSilver && ringRate >= 0.8) return 'silver';
  return 'bronze';
}

// Next objective the pilot should aim at: the nearest upcoming ring,
// beacon or drop zone by distance — beacons and villages are objectives
// too, not scenery to fly past. Runway once everything is behind us.
export function nextTarget(s) {
  const cands = [];
  const r = s.course.rings[s.nextRing];
  if (r) cands.push({ x: r.x, y: r.y, dist: r.dist, kind: 'ring' });
  for (const b of s.course.beacons) {
    if (!b.lit && b.dist > s.dist) cands.push({ x: b.x, y: b.y, dist: b.dist, kind: 'beacon' });
  }
  for (const d of s.course.drops) {
    if (!d.done && d.dist > s.dist) cands.push({ x: d.x, y: 150, dist: d.dist, kind: 'drop' });
  }
  cands.sort((a, b) => a.dist - b.dist);
  // Approach: once inside 1800 m of the strip, fly the glide even if an
  // objective was missed — the runway decides a landing mission. (All
  // drops, beacons and rings sit before the approach by construction,
  // except the final approach gate, which sits ON the glide path.)
  if (s.mission.landing && s.dist >= s.mission.length - 1800) {
    return { x: 0, y: 12, dist: s.mission.length, kind: 'runway' };
  }
  if (cands.length) return cands[0];
  if (s.mission.landing) return { x: 0, y: 12, dist: s.mission.length, kind: 'runway' };
  return null;
}
