// EMBERWING v3 — the world renderer.
// A pseudo-3D chase view in pure Canvas 2D: the camera sits behind the
// jet and looks down the valley, so everything ahead is projected with a
// pinhole (focal length 640 px). Terrain is layered sine ridges with
// parallax, the ground is a perspective plane with a river and the strip,
// and the objectives — gates, storm cells, villages, beacons — are drawn
// as 3D-placed sprites that grow as you close on them.
import { WORLD, SKIES } from './config.js';
import { mulberry32, range, ridgeline } from './rng.js';

const FOCAL = 640; // px: how strongly depth shrinks things

// --- world construction ----------------------------------------------------
export function createWorld(mission) {
  const rng = mulberry32(mission.seed * 13 + 5);
  const sky = SKIES[mission.sky] || SKIES.dawn;
  // Star field for the night sky, fixed per mission.
  const stars = [];
  for (let i = 0; i < 110; i++) {
    stars.push({ x: rng(), y: rng() * 0.46, r: range(rng, 0.6, 2.1), tw: range(rng, 0, Math.PI * 2) });
  }
  // Ridge phases: each mission's mountains sit differently.
  const ridgePhase = { a: range(rng, 0, 9), b: range(rng, 0, 9), c: range(rng, 0, 9) };
  // The river's meander, a slow sine pair plus a seeded wander.
  const riverPhase = range(rng, 0, 9);
  const riverBase = range(rng, -260, 260);
  // Canyon wall profile: a ridgeline of strata heights down the corridor.
  const strata = ridgeline(rng, 26, 0.25, 0.9, 0.22);
  return { mission, sky, stars, ridgePhase, riverPhase, riverBase, strata };
}

// --- camera + projection ---------------------------------------------------
export function cameraFor(state, cockpit) {
  if (cockpit) return { x: state.x, y: state.y + 2, dist: state.dist + 2 };
  return { x: state.x, y: state.y + 16, dist: state.dist - 55 };
}

// Horizon line and lateral shift for this frame. Climbing pushes the
// horizon down the screen; turning slides the world the other way.
export function horizonFor(state, h) {
  const hy = h * 0.5 + Math.max(-75, Math.min(75, state.vy)) * 0.35;
  const shift = Math.max(-42, Math.min(42, -state.vx * 0.35));
  return { hy, shift };
}

// Project a world point (dist ahead, x sideways, y up) to screen space.
// Returns null when the point is behind the camera.
export function projectPoint(cam, dist, x, y, w, h, hy, shift) {
  const depth = dist - cam.dist;
  if (depth < 8) return null;
  const k = FOCAL / depth;
  return {
    sx: w / 2 + shift + (x - cam.x) * k,
    sy: hy - (y - cam.y) * k,
    k,
    depth,
  };
}

// --- the scene -------------------------------------------------------------
export function drawWorld(ctx, state, world, view) {
  const { w, h, cockpit, time } = view;
  const sky = world.sky;
  const cam = cameraFor(state, cockpit);
  const { hy, shift } = horizonFor(state, h);
  const vpX = w / 2 + shift;

  drawSky(ctx, world, w, h, hy, time);
  drawRidges(ctx, world, w, h, hy, shift, state, 0.03, sky.ridgeFar, 0.10);
  drawRidges(ctx, world, w, h, hy, shift, state, 0.085, sky.ridgeNear, 0.17);
  drawGround(ctx, world, w, h, hy, vpX, state, cam);
  if (world.mission.canyon) drawCanyon(ctx, world, w, h, hy, vpX, state);
  drawRiver(ctx, world, w, h, hy, shift, state, cam);
  drawRunway(ctx, state, world, w, h, hy, shift, cam, time);
  drawDrops(ctx, state, w, h, hy, shift, cam);
  drawBeacons(ctx, state, w, h, hy, shift, cam, time);
  drawClouds(ctx, state, w, h, hy, shift, cam, time);
  drawRings(ctx, state, w, h, hy, shift, cam, time, !!view.menu);
}

function drawSky(ctx, world, w, h, hy, time) {
  const sky = world.sky;
  const g = ctx.createLinearGradient(0, 0, 0, hy + 2);
  g.addColorStop(0, sky.top);
  g.addColorStop(1, sky.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hy + 2);
  // Stars, only where the palette asks for them.
  if (sky.stars) {
    for (const s of world.stars) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.9 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#e8ecff';
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // Sun or moon: a disc with a soft halo.
  const sx = sky.sunX * w;
  const sy = sky.sunY * h;
  const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, sky.moon ? 70 : 120);
  halo.addColorStop(0, sky.sun);
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = sky.moon ? 0.55 : 0.8;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sx, sy, sky.moon ? 70 : 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = sky.sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sky.moon ? 20 : 30, 0, Math.PI * 2);
  ctx.fill();
  if (sky.moon) {
    ctx.fillStyle = 'rgba(180,190,220,0.5)';
    ctx.beginPath();
    ctx.arc(sx - 7, sy - 4, 5, 0, Math.PI * 2);
    ctx.arc(sx + 6, sy + 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A ridgeline: layered sines, phase scrolling with distance so the
// mountains drift past as you fly. `par` is the scroll speed, `amp` the
// height as a fraction of screen height.
function drawRidges(ctx, world, w, h, hy, shift, state, par, color, amp) {
  const p = world.ridgePhase;
  const phase = state.dist * par;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, hy + 2);
  for (let x = 0; x <= w; x += 14) {
    const u = (x + phase * 14) * 0.004;
    const ridge =
      Math.sin(u + p.a) * 0.55 +
      Math.sin(u * 2.7 + p.b) * 0.3 +
      Math.sin(u * 6.3 + p.c) * 0.15;
    const y = hy - (0.35 + ridge * 0.65) * amp * h;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, hy + 2);
  ctx.closePath();
  ctx.fill();
}

function drawGround(ctx, world, w, h, hy, vpX, state, cam) {
  const sky = world.sky;
  const g = ctx.createLinearGradient(0, hy, 0, h);
  g.addColorStop(0, sky.groundFar);
  g.addColorStop(1, sky.ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, hy, w, h - hy);
  // Perspective bands: horizontal lines at fixed depths ahead, closer
  // together near the horizon, plus longitudinal lines converging on the
  // vanishing point. Faint — they sell speed without shouting.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  for (const d of [180, 320, 560, 1000, 1800, 3200, 5600]) {
    const k = FOCAL / d;
    const y = hy + cam.y * k;
    if (y > hy + 4 && y < h) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  for (const gx of [-600, -300, 0, 300, 600]) {
    const kNear = FOCAL / 260;
    const kFar = FOCAL / 5600;
    const xNear = vpX + (gx - cam.x) * kNear;
    const yNear = hy + cam.y * kNear;
    const xFar = vpX + (gx - cam.x) * kFar;
    const yFar = hy + cam.y * kFar;
    ctx.beginPath();
    ctx.moveTo(xNear, Math.min(yNear, h));
    ctx.lineTo(xFar, yFar);
    ctx.stroke();
  }
}

// The canyon: two walls rising from the screen edges, converging on the
// vanishing point, with strata stripes that scroll with distance.
function drawCanyon(ctx, world, w, h, hy, vpX, state) {
  const gapTop = 330;
  const gapBottom = 940;
  const sway = Math.max(-60, Math.min(60, -state.x * 0.22));
  const cx = vpX + sway;
  // Left wall.
  wallPath(ctx, 0, cx - gapTop / 2, cx - gapBottom / 2, w, h, hy);
  // Right wall.
  wallPath(ctx, w, cx + gapTop / 2, cx + gapBottom / 2, w, h, hy);
  // Strata: horizontal bands across both walls, scrolling with distance.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 3;
  const scroll = (state.dist * 0.35) % 64;
  for (let y = hy - 20 + scroll; y < h + 40; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - 26);
    ctx.stroke();
  }
  ctx.restore();
}

function wallPath(ctx, edgeX, topX, botX, w, h, hy) {
  const g = ctx.createLinearGradient(0, hy, 0, h);
  g.addColorStop(0, '#7a5a40');
  g.addColorStop(1, '#4a3220');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(edgeX, hy - 30);
  ctx.lineTo(topX, hy);
  ctx.lineTo(botX, h);
  ctx.lineTo(edgeX, h);
  ctx.closePath();
  ctx.fill();
}

// The river: a faint steel-blue meander that starts 600 m out, so it
// never slashes across the foreground.
function drawRiver(ctx, world, w, h, hy, shift, state, cam) {
  const pts = [];
  for (let d = 600; d <= 5200; d += 200) {
    const dist = state.dist + d;
    const x =
      world.riverBase +
      Math.sin(dist * 0.0011 + world.riverPhase) * 210 +
      Math.sin(dist * 0.00023 + world.riverPhase * 2) * 130;
    const p = projectPoint(cam, dist, x, 0, w, h, hy, shift);
    if (!p) continue;
    pts.push({ ...p, width: Math.max(1.5, 26 * p.k) });
  }
  if (pts.length < 2) return;
  ctx.fillStyle = 'rgba(110,150,190,0.30)';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = p.sx - p.width / 2;
    if (i === 0) ctx.moveTo(x, p.sy);
    else ctx.lineTo(x, p.sy);
  });
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    ctx.lineTo(p.sx + p.width / 2, p.sy);
  }
  ctx.closePath();
  ctx.fill();
}

// The strip: asphalt polygon, centreline dashes, green threshold, bright
// edge lights and a column of white approach lights marching in from
// 360 m before the threshold, so the runway reads from 2 km out.
function drawRunway(ctx, state, world, w, h, hy, shift, cam, time) {
  const m = state.mission;
  if (!m.landing) return;
  const start = m.length - 600;
  const end = m.length;
  if (cam.dist > end + 40) return; // strip is behind us
  const half = 23;
  const near = projectPoint(cam, Math.max(start, cam.dist + 30), -half, 0, w, h, hy, shift);
  const nearR = projectPoint(cam, Math.max(start, cam.dist + 30), half, 0, w, h, hy, shift);
  const far = projectPoint(cam, end, -half, 0, w, h, hy, shift);
  const farR = projectPoint(cam, end, half, 0, w, h, hy, shift);
  if (!near || !nearR || !far || !farR) return;
  // Asphalt.
  ctx.fillStyle = '#3c3f46';
  ctx.beginPath();
  ctx.moveTo(near.sx, near.sy);
  ctx.lineTo(nearR.sx, nearR.sy);
  ctx.lineTo(farR.sx, farR.sy);
  ctx.lineTo(far.sx, far.sy);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes, every 50 m of strip.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, 2.4 * near.k);
  for (let d = start + 25; d < end; d += 50) {
    const a = projectPoint(cam, d, 0, 0, w, h, hy, shift);
    const b = projectPoint(cam, d + 22, 0, 0, w, h, hy, shift);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  // Threshold bar, green.
  const t1 = projectPoint(cam, start, -half, 0, w, h, hy, shift);
  const t2 = projectPoint(cam, start, half, 0, w, h, hy, shift);
  if (t1 && t2) {
    ctx.strokeStyle = '#39d353';
    ctx.lineWidth = Math.max(2, 4 * t1.k);
    ctx.beginPath();
    ctx.moveTo(t1.sx, t1.sy);
    ctx.lineTo(t2.sx, t2.sy);
    ctx.stroke();
  }
  // Edge lights: green dots down both sides, every 75 m.
  for (let d = start; d <= end; d += 75) {
    for (const x of [-half, half]) {
      const p = projectPoint(cam, d, x, 0, w, h, hy, shift);
      if (!p) continue;
      const r = Math.max(1.6, 2.6 * p.k);
      ctx.fillStyle = '#7dff8a';
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Approach lights: a white column marching in to the threshold.
  for (let d = start - 360; d < start; d += 60) {
    const p = projectPoint(cam, d, 0, 0, w, h, hy, shift);
    if (!p) continue;
    const pulse = 0.75 + 0.25 * Math.sin(time * 5 + d * 0.05);
    const r = Math.max(2, 3.4 * p.k);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Villages waiting on a drop: a few lit houses on the ground. Done ones
// show a green ring and a crate; pending ones a small amber beacon.
function drawDrops(ctx, state, w, h, hy, shift, cam) {
  for (const d of state.course.drops) {
    const p = projectPoint(cam, d.dist, d.x, 0, w, h, hy, shift);
    if (!p || p.depth > 5200) continue;
    const s = Math.max(2, p.k);
    ctx.fillStyle = d.done ? '#2f6b3a' : '#8a6a3a';
    for (let i = -1; i <= 1; i++) {
      const hx = p.sx + i * 9 * s;
      ctx.fillRect(hx - 4 * s, p.sy - 7 * s, 8 * s, 7 * s);
      ctx.fillStyle = d.done ? '#3f8b4c' : '#a8804a';
      ctx.beginPath();
      ctx.moveTo(hx - 5 * s, p.sy - 7 * s);
      ctx.lineTo(hx, p.sy - 12 * s);
      ctx.lineTo(hx + 5 * s, p.sy - 7 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = d.done ? '#2f6b3a' : '#8a6a3a';
    }
    if (d.done) {
      ctx.strokeStyle = '#39d353';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy - 8 * s, 16 * s, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffb52e';
      ctx.beginPath();
      ctx.arc(p.sx, p.sy - 16 * s, 2.6 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Night beacons: a mast with a lamp. Lit ones glow warm gold; unlit ones
// are a dim red dot you can still find in the dark.
function drawBeacons(ctx, state, w, h, hy, shift, cam, time) {
  for (const b of state.course.beacons) {
    const base = projectPoint(cam, b.dist, b.x, 0, w, h, hy, shift);
    const top = projectPoint(cam, b.dist, b.x, b.y, w, h, hy, shift);
    if (!base || !top || top.depth > 5200) continue;
    ctx.strokeStyle = 'rgba(20,20,28,0.9)';
    ctx.lineWidth = Math.max(1, 2 * top.k);
    ctx.beginPath();
    ctx.moveTo(base.sx, base.sy);
    ctx.lineTo(top.sx, top.sy);
    ctx.stroke();
    const r = Math.max(2, (b.lit ? 5 : 3) * top.k);
    if (b.lit) {
      const glow = ctx.createRadialGradient(top.sx, top.sy, 1, top.sx, top.sy, r * 5);
      glow.addColorStop(0, 'rgba(255,190,80,0.9)');
      glow.addColorStop(1, 'rgba(255,190,80,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(top.sx, top.sy, r * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = b.lit ? '#ffd76a' : `rgba(255,80,80,${0.5 + 0.4 * Math.sin(time * 3)})`;
    ctx.beginPath();
    ctx.arc(top.sx, top.sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Storm cells: dark puffs built from overlapping circles, lightning-white
// tops when the cell is close. A flown-through cell is gone (dissipated).
function drawClouds(ctx, state, w, h, hy, shift, cam, time) {
  for (let i = 0; i < state.course.clouds.length; i++) {
    const c = state.course.clouds[i];
    if (c.hit) continue;
    const p = projectPoint(cam, c.dist, c.x, c.y, w, h, hy, shift);
    if (!p || p.depth > 6000) continue;
    const r = c.r * p.k;
    if (r < 2) continue;
    const night = state.mission.sky === 'night';
    ctx.fillStyle = night ? 'rgba(28,30,44,0.92)' : 'rgba(52,56,72,0.88)';
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 + i;
      const ox = Math.cos(a) * r * 0.55;
      const oy = Math.sin(a) * r * 0.35 - r * 0.1;
      ctx.beginPath();
      ctx.arc(p.sx + ox, p.sy + oy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    // A pale belly when the cell is near — you can read its size.
    if (p.depth < 1200) {
      ctx.fillStyle = night ? 'rgba(120,130,170,0.25)' : 'rgba(200,205,220,0.30)';
      ctx.beginPath();
      ctx.arc(p.sx, p.sy + r * 0.25, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// The gates: gold rings standing on the course. The next one pulses and
// carries its distance; hit ones fade to a ghost. A gate off the side of
// the frame gets a gold arrow on the screen edge instead.
function drawRings(ctx, state, w, h, hy, shift, cam, time, menu = false) {
  const rings = state.course.rings;
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const p = projectPoint(cam, r.dist, r.x, r.y, w, h, hy, shift);
    if (!p || p.depth > 6000) continue;
    const radius = r.r * p.k;
    if (radius < 2) continue;
    const isNext = i === state.nextRing;
    const cx = Math.max(30, Math.min(w - 30, p.sx));
    const offscreen = p.sx < 30 || p.sx > w - 30;
    if (offscreen && !r.hit) {
      // Edge arrow pointing at the gate.
      const dir = p.sx < 30 ? -1 : 1;
      const ax = dir < 0 ? 26 : w - 26;
      const ay = Math.max(60, Math.min(h - 60, p.sy));
      ctx.fillStyle = '#ffb52e';
      ctx.beginPath();
      ctx.moveTo(ax + dir * 14, ay);
      ctx.lineTo(ax - dir * 8, ay - 10);
      ctx.lineTo(ax - dir * 8, ay + 10);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    const pulse = isNext ? 1 + 0.045 * Math.sin(time * 4) : 1;
    const rr = radius * pulse;
    const alpha = r.hit ? 0.25 : 1;
    ctx.globalAlpha = alpha;
    // Halo.
    const glow = ctx.createRadialGradient(cx, p.sy, rr * 0.4, cx, p.sy, rr * 1.7);
    glow.addColorStop(0, isNext ? 'rgba(255,181,46,0.30)' : 'rgba(255,181,46,0.14)');
    glow.addColorStop(1, 'rgba(255,181,46,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, p.sy, rr * 1.7, 0, Math.PI * 2);
    ctx.fill();
    // The ring itself: two strokes, bright core over a deep gold rim.
    ctx.strokeStyle = '#c77f0e';
    ctx.lineWidth = Math.max(2, rr * 0.16);
    ctx.beginPath();
    ctx.arc(cx, p.sy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = isNext ? '#ffd76a' : '#e8a92c';
    ctx.lineWidth = Math.max(1.5, rr * 0.07);
    ctx.beginPath();
    ctx.arc(cx, p.sy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Distance label over the next gate — never on a menu backdrop,
    // where it would sit on top of the menu text.
    if (isNext && !r.hit && !menu) {
      const label = `${Math.round(p.depth)}m`;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,10,16,0.85)';
      ctx.strokeText(label, cx, p.sy - rr - 8);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(label, cx, p.sy - rr - 8);
    }
  }
}

// --- the chase jet ---------------------------------------------------------
// Where the jet sits on screen in chase view, and how big it draws.
export function jetPos(w, h) {
  return { x: w / 2, y: h * 0.66 };
}

// Bright silver dart seen from behind and slightly above: fuselage, swept
// wings, tail fins, canopy glint, blinking wingtip strobes, and an
// afterburner flame that stays lit from throttle 0.4 with a minimum
// visible length, so even the approach shows fire.
export function drawJet(ctx, state, w, h, time) {
  const { x, y } = jetPos(w, h);
  const s = 1.3; // ~30% larger than the old silhouette, so it reads
  const bank = Math.max(-0.14, Math.min(0.14, -state.vx * 0.0012));
  const sway = Math.max(-30, Math.min(30, state.vx * 0.12));
  ctx.save();
  ctx.translate(x + sway, y);
  ctx.rotate(bank);
  ctx.scale(s, s);
  // Afterburner flame (drawn first, behind the tail).
  if (state.throttle >= 0.4) {
    const flick = 1 + 0.18 * Math.sin(time * 31) + 0.1 * Math.sin(time * 47);
    const len = Math.max(20, (state.throttle - 0.3) * 110) * flick;
    const flame = ctx.createLinearGradient(0, 34, 0, 34 + len);
    flame.addColorStop(0, 'rgba(255,240,170,0.95)');
    flame.addColorStop(0.45, 'rgba(255,150,50,0.85)');
    flame.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-7, 32);
    ctx.lineTo(7, 32);
    ctx.lineTo(0, 34 + len);
    ctx.closePath();
    ctx.fill();
  }
  // Wings: swept, silver with a darker leading edge.
  const wingGrad = ctx.createLinearGradient(-64, 0, 64, 0);
  wingGrad.addColorStop(0, '#c9ced8');
  wingGrad.addColorStop(0.5, '#eef1f6');
  wingGrad.addColorStop(1, '#c9ced8');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(-10, -6);
  ctx.lineTo(-66, 26);
  ctx.lineTo(-60, 32);
  ctx.lineTo(-6, 14);
  ctx.lineTo(6, 14);
  ctx.lineTo(60, 32);
  ctx.lineTo(66, 26);
  ctx.lineTo(10, -6);
  ctx.closePath();
  ctx.fill();
  // Tail fins.
  ctx.fillStyle = '#b7bdc9';
  ctx.beginPath();
  ctx.moveTo(-8, 18);
  ctx.lineTo(-20, 40);
  ctx.lineTo(-12, 40);
  ctx.lineTo(-2, 22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, 18);
  ctx.lineTo(20, 40);
  ctx.lineTo(12, 40);
  ctx.lineTo(2, 22);
  ctx.closePath();
  ctx.fill();
  // Fuselage: bright silver, tapering to the nose.
  const body = ctx.createLinearGradient(-9, 0, 9, 0);
  body.addColorStop(0, '#9aa1af');
  body.addColorStop(0.35, '#f4f6fa');
  body.addColorStop(0.65, '#e8ebf1');
  body.addColorStop(1, '#9aa1af');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -52);
  ctx.quadraticCurveTo(9, -20, 8, 16);
  ctx.quadraticCurveTo(7, 34, 0, 36);
  ctx.quadraticCurveTo(-7, 34, -8, 16);
  ctx.quadraticCurveTo(-9, -20, 0, -52);
  ctx.fill();
  // Canopy glint.
  ctx.fillStyle = 'rgba(140,200,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(0, -26, 4.5, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-1, -30, 1.6, 5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Wingtip strobes: a double blink every second.
  const blink = (time % 1) < 0.12 || ((time % 1) > 0.2 && (time % 1) < 0.28);
  if (blink) {
    ctx.fillStyle = '#ffffff';
    for (const wx of [-64, 64]) {
      ctx.beginPath();
      ctx.arc(wx, 29, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const wx of [-64, 64]) {
      ctx.beginPath();
      ctx.arc(wx, 29, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
