// Autopilot — the same controller the sim uses to prove a mission is
// winnable, and the in-game assist (hold G) a new pilot can lean on.
// It flies like a careful pilot: aim at the next ring, bleed speed for the
// landing, and slide around storm cells instead of through them.
import { WORLD } from './config.js';
import { clamp, nextTarget } from './flight.js';

export function autopilotInput(s, dt) {
  const target = nextTarget(s);
  if (!target) return { steer: 0, pitch: 0, throttle: 0.4, drop: false };

  // --- cloud avoidance: if a live cell sits on our line, sidestep it ---
  let aimX = target.x;
  let aimY = target.y;
  for (const c of s.course.clouds) {
    if (c.hit) continue;
    const ahead = c.dist - s.dist;
    if (ahead > 0 && ahead < 700) {
      const dx = c.x - s.x;
      const dy = c.y - s.y;
      const lateral = Math.abs(dx);
      const vertical = Math.abs(dy);
      if (lateral < c.r + 120 && vertical < c.r + 90) {
        // slide to the clearer side, keeping the ring in reach
        const side = dx >= 0 ? -1 : 1;
        aimX = c.x + side * (c.r + 170);
        aimX = clamp(aimX, -WORLD.halfWidth, WORLD.halfWidth);
        if (dy > -40) aimY = Math.min(aimY, c.y - c.r - 60);
        break;
      }
    }
  }

  // --- PD steering: proportional on position error, damped by velocity ---
  const ex = aimX - s.x;
  const ey = aimY - s.y;
  let steer = clamp(ex / 90 - s.vx / 120, -1, 1);
  let pitch = clamp(ey / 80 - s.vy / 75, -1, 1);

  // --- throttle: full cruise, gentle on approach, slow for the runway ---
  let throttle = 0.88;
  const distToTarget = target.dist - s.dist;
  // Slow down when the next gate is far off-line: arriving late beats
  // arriving fast and 60 m to the side.
  if (Math.abs(ex) > 150 || Math.abs(ey) > 120) throttle = 0.55;
  if (target.kind === 'runway') {
    throttle = s.y > 60 ? 0.42 : 0.3;
    // descend on a steady glide: a constant-slope descent to a touchdown
    // point mid-strip. The wanted sink rate is height over time-to-that
    // point, so the jet arrives at y=2 right at the threshold instead of
    // diving early or floating past the strip end. The plant is direct
    // (vy = pitch * maxClimb), so the pitch for a wanted vy is just
    // vy / maxClimb — a feedback term here would flip sign every frame
    // and porpoise.
    const aimDist = s.mission.length - 300;
    let vyTarget;
    if (s.dist >= aimDist) {
      // past the aim point: descend firmly to the strip, no more easing —
      // the exponential tail would float forever on a bad gust
      vyTarget = -12;
    } else {
      const distToAim = Math.max(120, aimDist - s.dist);
      vyTarget = -Math.min(55, Math.max(4, (s.y - 2) * s.speed / distToAim));
    }
    pitch = clamp(vyTarget / WORLD.maxClimb, -1, 1);
    if (s.y < 8) throttle = 0.22;
  } else if (distToTarget < 260) {
    throttle = 0.72;
  }
  if (s.fuel < 0.12) throttle = Math.min(throttle, 0.55);

  // --- drop: release when a village is under us, low and close ---
  let drop = false;
  for (const d of s.course.drops) {
    if (!d.done && Math.abs(s.dist - d.dist) < 100 && Math.abs(s.x - d.x) < 120 && s.y < 210) {
      drop = true;
    }
  }

  return { steer, pitch, throttle, drop };
}
