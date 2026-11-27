// EMBERWING v3 — game loop, screens, campaign.
// States: menu → briefing → fly → complete | crashed → menu.
// Campaign progress (medals, merits, upgrades, rank) persists in
// localStorage under 'emberwing-v3'. Pure client-side, no network.
// v3: cockpit view (C in flight, or ?shot=cockpit), a bigger chase jet,
// and a hero preset that frames the last gate with the runway behind it.
import { MISSIONS, FREE_FLIGHT, PALETTES, UPGRADES, MEDAL_MERITS, rankFor } from './config.js';
import { newState, step, medalFor, nextTarget, clamp } from './flight.js';
import { autopilotInput } from './autopilot.js';
import { WorldRenderer } from './world.js';
import { Hud } from './hud.js';
import { Cockpit } from './cockpit.js';
import { Particles } from './particles.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { parseShot } from './shots.js';
import { mulberry32 } from './rng.js';

const SAVE_KEY = 'emberwing-v3';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fresh start */ }
  return { medals: {}, merits: 0, upgrades: {}, best: {} };
}

function storeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* private mode */ }
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const world = new WorldRenderer(canvas);
const hud = new Hud(canvas);
const cockpit = new Cockpit(canvas);
const particles = new Particles();
const audio = new AudioEngine();
const input = new Input(canvas);

function fitCanvas() {
  const w = Math.min(window.innerWidth, 1600);
  const h = Math.min(window.innerHeight, 1000);
  canvas.width = w;
  canvas.height = h;
  world.resize(w, h);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const save = loadSave();
const game = {
  screen: 'menu', // menu | briefing | fly | complete | crashed | hangar
  missionIndex: 0,
  state: null,
  autopilot: false,
  cockpit: false,
  paused: false,
  throttle: 0.7,
  time: 0,
  lastRingHit: -1,
  lastDrop: -1,
  lastBeacon: -1,
  menuSel: 0,
  hangarSel: 0,
  result: null,
  shot: parseShot(window.location.search),
  rng: mulberry32(1234),
};

function allMissions() {
  return [...MISSIONS, FREE_FLIGHT];
}

function startMission(idx) {
  const mission = allMissions()[idx];
  game.missionIndex = idx;
  game.state = newState(mission, save.upgrades);
  game.autopilot = false;
  game.paused = false;
  game.throttle = 0.7;
  game.time = 0;
  game.lastRingHit = -1;
  game.lastDrop = -1;
  game.lastBeacon = -1;
  game.result = null;
  particles.clear();
  game.screen = 'fly';
  audio.ensure();
}

function medalRank(m) {
  return { gold: 3, silver: 2, bronze: 1 }[m] || 0;
}

function finishMission() {
  const s = game.state;
  const medal = medalFor(s.mission, s);
  const prev = save.medals[s.mission.id];
  if (medal && (!prev || medalRank(medal) > medalRank(prev))) {
    save.medals[s.mission.id] = medal;
    if (!prev) save.merits += MEDAL_MERITS[medal];
    else save.merits += Math.max(0, MEDAL_MERITS[medal] - MEDAL_MERITS[prev]);
  }
  const key = s.mission.id;
  if (!save.best[key] || s.time < save.best[key]) save.best[key] = Math.round(s.time * 10) / 10;
  storeSave(save);
  game.result = {
    medal,
    time: s.time,
    rings: s.ringsHit,
    totalRings: s.course.rings.length,
    drops: s.dropsDone,
    hull: Math.round(s.hull),
    reason: s.reason,
    status: s.status,
  };
  game.screen = s.status === 'complete' ? 'complete' : 'crashed';
  if (medal) audio.fanfare(medal);
  else if (s.status !== 'complete') audio.explosion();
}

// ---------- menu helpers ----------
function drawTitle(t) {
  const W = canvas.width;
  const H = canvas.height;
  // animated dawn backdrop behind the menu
  const pal = PALETTES.dawn;
  world.drawSky(pal, t, false);
  world.drawRidges(pal, Math.sin(t * 0.05) * 60, 11);
  world.drawGround(pal, 0, 260, t * 40, false);
  // jet silhouette crossing the sky
  const jx = ((t * 90) % (W + 400)) - 200;
  const jy = H * 0.30 + Math.sin(t * 0.8) * 8;
  ctx.save();
  ctx.translate(jx, jy);
  ctx.fillStyle = 'rgba(20, 16, 32, 0.85)';
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(26, 4);
  ctx.lineTo(0, 8);
  ctx.lineTo(-26, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // ember particles drifting up
  if (Math.random() < 0.3) particles.ember(Math.random() * W, H * 0.9);
  particles.update(1 / 60);
  particles.draw(ctx);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText('EMBERWING', W / 2, H * 0.30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('S T O R M F R O N T   C A M P A I G N', W / 2, H * 0.30 + 40);
  ctx.fillStyle = '#dfe8ff';
  ctx.font = '15px system-ui, sans-serif';
  const rank = rankFor(save.merits);
  ctx.fillText(`Pilot ${rank.name} · ${save.merits} merits · ${Object.keys(save.medals).length}/5 missions flown`, W / 2, H * 0.30 + 66);
  ctx.textAlign = 'left';
}

function drawMenuList(t) {
  const W = canvas.width;
  const H = canvas.height;
  const missions = allMissions();
  const x0 = W / 2 - 330;
  const y0 = H * 0.44;
  const rowH = 52;
  missions.forEach((m, i) => {
    const y = y0 + i * rowH;
    const sel = i === game.menuSel;
    const locked = i > 0 && i < 5 && !save.medals[missions[i - 1].id];
    ctx.fillStyle = sel ? 'rgba(255, 215, 106, 0.16)' : 'rgba(8, 12, 22, 0.55)';
    ctx.strokeStyle = sel ? '#ffd76a' : 'rgba(140, 180, 230, 0.3)';
    ctx.lineWidth = sel ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x0, y, 660, 44, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sel ? '#ffd76a' : '#dfe8ff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const label = m.num === 0 ? 'FREE FLIGHT' : `${m.num}. ${m.name.toUpperCase()}`;
    ctx.fillText(locked ? `${label}  ·  🔒 finish ${missions[i - 1].name} first` : label, x0 + 16, y + 19);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#9fb4d8';
    const sub = m.num === 0
      ? 'Endless rings — how far can you go?'
      : `${m.rings} rings${m.drops ? ` · ${m.drops} drops` : ''}${m.landing ? ' · landing' : ''}${m.beacons ? ` · ${m.beacons} beacons` : ''}`;
    ctx.fillText(sub, x0 + 16, y + 36);
    const medal = save.medals[m.id];
    if (medal) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillStyle = medal === 'gold' ? '#ffd76a' : medal === 'silver' ? '#dfe8ff' : '#e8a56b';
      ctx.fillText(medal === 'gold' ? '★ GOLD' : medal === 'silver' ? '★ SILVER' : '★ BRONZE', x0 + 644, y + 29);
      ctx.textAlign = 'left';
    }
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe8ff';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('↑ ↓ choose · Enter fly · H hangar (upgrades) · C cockpit view in flight · Arrows / WASD + mouse', W / 2, y0 + missions.length * rowH + 26);
  ctx.textAlign = 'left';
}

function drawBriefing() {
  const W = canvas.width;
  const H = canvas.height;
  const m = allMissions()[game.menuSel];
  const pal = PALETTES[m.palette];
  world.drawSky(pal, game.time, m.night);
  world.drawRidges(pal, 0, m.seed);
  ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(m.num === 0 ? 'FREE FLIGHT' : `MISSION ${m.num} — ${m.name.toUpperCase()}`, W / 2, H * 0.30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px system-ui, sans-serif';
  wrapText(m.briefing, W / 2, H * 0.38, 620, 26);
  ctx.fillStyle = '#9fb4d8';
  ctx.font = '15px system-ui, sans-serif';
  const par = m.parGold
    ? `Gold ≤ ${fmtTime(m.parGold)} · Silver ≤ ${fmtTime(m.parSilver)} · ${m.rings} rings`
    : `${m.rings} rings · fuel top-up per ring`;
  ctx.fillText(par, W / 2, H * 0.30 + 150);
  const best = save.best[m.id];
  if (best) {
    ctx.fillText(`Your best: ${fmtTime(best)} · Medal: ${(save.medals[m.id] || '—').toUpperCase()}`, W / 2, H * 0.30 + 176);
  }
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('ENTER — TAKE OFF · ESC — BACK', W / 2, H * 0.30 + 220);
  ctx.textAlign = 'left';
}

function wrapText(text, cx, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  ctx.fillText(line, cx, yy);
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function drawHangar() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = 'rgba(8, 12, 22, 0.88)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('HANGAR', W / 2, H * 0.18);
  ctx.fillStyle = '#dfe8ff';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(`Merits to spend: ${save.merits}  ·  earn merits from medals (gold 3 · silver 2 · bronze 1)`, W / 2, H * 0.18 + 32);
  const keys = Object.keys(UPGRADES);
  const x0 = W / 2 - 330;
  const y0 = H * 0.30;
  keys.forEach((k, i) => {
    const u = UPGRADES[k];
    const lvl = save.upgrades[k] || 0;
    const y = y0 + i * 64;
    const sel = i === game.hangarSel;
    const maxed = lvl >= u.max;
    const cost = maxed ? null : u.costs[lvl];
    ctx.fillStyle = sel ? 'rgba(255, 215, 106, 0.16)' : 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = sel ? '#ffd76a' : 'rgba(140, 180, 230, 0.3)';
    ctx.beginPath();
    ctx.roundRect(x0, y, 660, 54, 8);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = sel ? '#ffd76a' : '#ffffff';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(u.name, x0 + 16, y + 22);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(u.desc, x0 + 16, y + 42);
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = maxed ? '#7dff9a' : cost <= save.merits ? '#ffd76a' : '#8a94a8';
    ctx.fillText(maxed ? 'MAX' : `LVL ${lvl}/${u.max} · ${cost} merits`, x0 + 644, y + 32);
    ctx.textAlign = 'left';
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe8ff';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('↑ ↓ choose · Enter buy · ESC back to menu', W / 2, y0 + keys.length * 64 + 30);
  ctx.textAlign = 'left';
}

function drawResult() {
  const W = canvas.width;
  const H = canvas.height;
  const r = game.result;
  ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (r.status === 'complete') {
    ctx.fillStyle = '#7dff9a';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText('MISSION COMPLETE', W / 2, H * 0.28);
    if (r.medal) {
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillStyle = r.medal === 'gold' ? '#ffd76a' : r.medal === 'silver' ? '#e8ecff' : '#e8a56b';
      ctx.fillText(r.medal === 'gold' ? '★ GOLD ★' : r.medal === 'silver' ? '★ SILVER ★' : '★ BRONZE ★', W / 2, H * 0.28 + 78);
    }
  } else {
    ctx.fillStyle = '#ff5a4e';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText('MISSION FAILED', W / 2, H * 0.28);
    ctx.fillStyle = '#ffb35e';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(r.reason, W / 2, H * 0.28 + 44);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px system-ui, sans-serif';
  const lines = [
    `Time ${fmtTime(r.time)} · Rings ${r.rings}/${r.totalRings}`,
    r.drops ? `Drops delivered ${r.drops}` : null,
    `Hull ${r.hull}%`,
    `Merits ${save.merits} · Rank ${rankFor(save.merits).name}`,
  ].filter(Boolean);
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.28 + 130 + i * 28));
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText('ENTER — FLY AGAIN · ESC — MENU', W / 2, H * 0.28 + 130 + lines.length * 28 + 30);
  ctx.textAlign = 'left';
}

// ---------- main loop ----------
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.time += dt;
  const t = game.time;

  // --- global keys ---
  if (input.wasPressed('m')) {
    const muted = audio.toggleMute();
    void muted;
  }

  if (game.screen === 'menu') {
    if (input.wasPressed('arrowdown') || input.wasPressed('s')) {
      game.menuSel = (game.menuSel + 1) % allMissions().length;
      audio.click();
    }
    if (input.wasPressed('arrowup') || input.wasPressed('w')) {
      game.menuSel = (game.menuSel - 1 + allMissions().length) % allMissions().length;
      audio.click();
    }
    if (input.wasPressed('h')) {
      game.screen = 'hangar';
      audio.click();
    }
    if (input.wasPressed('enter')) {
      const missions = allMissions();
      const locked = game.menuSel > 0 && game.menuSel < 5 && !save.medals[missions[game.menuSel - 1].id];
      if (!locked) {
        game.screen = 'briefing';
        audio.click();
      } else audio.thud();
    }
    drawTitle(t);
    drawMenuList(t);
  } else if (game.screen === 'hangar') {
    if (input.wasPressed('escape')) game.screen = 'menu';
    if (input.wasPressed('arrowdown') || input.wasPressed('s')) game.hangarSel = (game.hangarSel + 1) % 4;
    if (input.wasPressed('arrowup') || input.wasPressed('w')) game.hangarSel = (game.hangarSel - 1 + 4) % 4;
    if (input.wasPressed('enter')) {
      const k = Object.keys(UPGRADES)[game.hangarSel];
      const u = UPGRADES[k];
      const lvl = save.upgrades[k] || 0;
      if (lvl < u.max && save.merits >= u.costs[lvl]) {
        save.merits -= u.costs[lvl];
        save.upgrades[k] = lvl + 1;
        storeSave(save);
        audio.ring();
      } else audio.thud();
    }
    drawHangar();
  } else if (game.screen === 'briefing') {
    if (input.wasPressed('escape')) game.screen = 'menu';
    if (input.wasPressed('enter')) startMission(game.menuSel);
    drawBriefing();
  } else if (game.screen === 'fly') {
    flyFrame(dt, t);
  } else if (game.screen === 'complete' || game.screen === 'crashed') {
    if (input.wasPressed('enter')) startMission(game.missionIndex);
    if (input.wasPressed('escape')) game.screen = 'menu';
    // scenic backdrop behind the result panel (the shot preset jumps
    // straight here, so without this the panel sits on a black canvas)
    const pal = PALETTES[allMissions()[game.missionIndex].palette] || PALETTES.dawn;
    world.drawSky(pal, t, allMissions()[game.missionIndex].night);
    world.drawRidges(pal, 0, allMissions()[game.missionIndex].seed);
    world.drawGround(pal, 0, 260, 0, false);
    drawResult();
  }

  requestAnimationFrame(frame);
}

function flyFrame(dt, t) {
  const s = game.state;
  const pal = PALETTES[s.mission.palette];
  const W = canvas.width;
  const H = canvas.height;

  if (input.wasPressed('p')) game.paused = !game.paused;
  if (input.wasPressed('g')) {
    game.autopilot = !game.autopilot;
    audio.click();
  }
  if (input.wasPressed('c')) {
    game.cockpit = !game.cockpit;
    audio.click();
  }
  if (input.wasPressed('escape')) {
    game.screen = 'menu';
    audio.update(0, 0, false);
    return;
  }

  let inp;
  if (game.paused) {
    inp = { steer: 0, pitch: 0, throttle: s.throttle, drop: false };
  } else if (game.autopilot) {
    inp = autopilotInput(s, dt);
    game.throttle = inp.throttle;
  } else {
    const f = input.flight(game.throttle);
    game.throttle = clamp(game.throttle + f.throttleDelta * dt, 0, 1);
    inp = { steer: f.steer, pitch: f.pitch, throttle: game.throttle, drop: f.drop };
  }

  if (!game.paused) {
    const prevRings = s.ringsHit;
    const prevDrops = s.dropsDone;
    const prevBeacons = s.beaconsLit;
    const prevHull = s.hull;
    step(s, inp, dt, game.rng);
    if (s.ringsHit > prevRings) {
      audio.ring();
      const r = s.course.rings[s.ringsHit - 1];
      if (r) {
        const p = world.project(r.x, r.y, Math.max(30, r.dist - s.dist + 60), s.x, s.y);
        particles.ringBurst(p.x, p.y);
      }
    }
    if (s.dropsDone > prevDrops) audio.drop();
    if (s.beaconsLit > prevBeacons) audio.ring();
    if (s.hull < prevHull) {
      audio.thud();
      particles.explosion(W / 2, H * 0.6);
    }
    if (s.status !== 'flying') {
      audio.update(0, 0, false);
      finishMission();
      return;
    }
    particles.update(dt);
  }

  // --- render ---
  ctx.save();
  if (s.shake > 0.05) {
    ctx.translate((Math.random() - 0.5) * s.shake * 14, (Math.random() - 0.5) * s.shake * 14);
  }
  world.drawSky(pal, t, s.mission.night);
  world.drawRidges(pal, s.x, s.mission.seed);
  world.drawGround(pal, s.x, s.y, s.dist, !!s.mission.canyon);
  world.drawClouds(pal, s, t, s.x, s.y);
  if (s.mission.landing) world.drawRunway(s, s.x, s.y);
  world.drawRings(s, s.x, s.y);
  if (s.mission.beacons) world.drawBeacons(s, s.x, s.y, t);
  if (pal.rain) world.drawRain(dt);
  world.drawLightning(dt, pal);
  particles.draw(ctx);
  if (!game.cockpit) {
    world.drawPlane(s, inp, t, particles);
    world.speedLines(s.speed / 320);
  } else {
    world.speedLines(s.speed / 320);
  }
  world.fog(pal, s.mission.night ? 0.7 : 0.35);
  world.vignette();
  ctx.restore();

  if (game.cockpit) {
    cockpit.draw(s, inp, t, W, H);
    hud.draw(s, inp, t, W, H, true); // cockpit mode: top bar + warnings only
  } else {
    hud.draw(s, inp, t, W, H, false);
  }
  audio.update(game.throttle, s.speed / 320, s.status === 'flying' && !game.paused);

  if (game.paused) {
    ctx.fillStyle = 'rgba(8, 12, 22, 0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#9fb4d8';
    ctx.fillText('P resume · ESC menu', W / 2, H / 2 + 32);
    ctx.textAlign = 'left';
  }
}

// ---------- screenshot presets ----------
function applyShot() {
  const shot = game.shot;
  if (!shot) return;
  if (shot.screen === 'menu') {
    game.screen = 'menu';
    return;
  }
  if (shot.screen === 'complete') {
    const mission = allMissions()[shot.mission];
    game.state = newState(mission, {});
    game.state.status = 'complete';
    game.state.time = shot.time;
    game.state.ringsHit = mission.rings;
    game.state.hull = 100;
    game.missionIndex = shot.mission;
    game.result = {
      medal: shot.medal, time: shot.time, rings: mission.rings,
      totalRings: mission.rings, drops: 0, hull: 100,
      reason: 'Course complete.', status: 'complete',
    };
    game.screen = 'complete';
    return;
  }
  // fly preset: warm the autopilot forward so the shot is mid-action
  const mission = allMissions()[shot.mission];
  game.missionIndex = shot.mission;
  game.state = newState(mission, {});
  game.autopilot = true;
  game.cockpit = !!shot.cockpit;
  game.screen = 'fly';
  const rng = mulberry32(shot.seed);
  const dt = 1 / 60;
  if (shot.warmupDist) {
    // step until the jet reaches the target distance (the approach gate)
    let guard = 0;
    while (game.state.dist < shot.warmupDist && game.state.status === 'flying' && guard < 60 * 240) {
      const inp = autopilotInput(game.state, dt);
      step(game.state, inp, dt, rng);
      guard++;
    }
  } else {
    const steps = Math.floor((shot.warmup || 8) / dt);
    for (let i = 0; i < steps; i++) {
      const inp = autopilotInput(game.state, dt);
      step(game.state, inp, dt, rng);
      if (game.state.status !== 'flying') break;
    }
  }
  audio.ensure();
}

// driver hooks for the screenshot tool
window.__emberwing = {
  get state() { return game.state; },
  get screen() { return game.screen; },
  startMission,
  game,
};

applyShot();
requestAnimationFrame(frame);
