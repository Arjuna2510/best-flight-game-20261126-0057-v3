// EMBERWING v3 — the game itself.
// One canvas, four screens: menu (missions + hangar), briefing, flying,
// result. The flight model is the pure sim in flight.js, so the game you
// play is the game the autopilot proves winnable; the renderer in
// world.js paints it, the HUD in hud.js reads it, and the cockpit in
// cockpit.js sits you inside it. Screenshot presets (?shot=hero etc.)
// warm the autopilot to a fixed moment so the shots are genuine renders.
import { MISSIONS, FREE_FLIGHT, MEDAL_MERITS, UPGRADES, RANKS } from './config.js';
import { newState, step, medalFor, clamp } from './flight.js';
import { autopilotInput } from './autopilot.js';
import { mulberry32 } from './rng.js';
import { Particles } from './particles.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { createWorld, drawWorld, drawJet, jetPos } from './world.js';
import { drawHUD } from './hud.js';
import { drawCockpit } from './cockpit.js';
import { parseShot } from './shots.js';

const W = 1280;
const H = 800;
const SAVE_KEY = 'emberwing-v3';
const MEDAL_ORDER = { bronze: 1, silver: 2, gold: 3 };
const ALL_MISSIONS = [...MISSIONS, FREE_FLIGHT];
const UPGRADE_KEYS = Object.keys(UPGRADES);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const audio = new AudioEngine();

// --- save ------------------------------------------------------------------
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        merits: s.merits || 0,
        earned: s.earned || 0,
        upgrades: { engine: 0, tanks: 0, armor: 0, handling: 0, ...(s.upgrades || {}) },
        best: s.best || {},
      };
    }
  } catch { /* a fresh save is fine */ }
  return { merits: 0, earned: 0, upgrades: { engine: 0, tanks: 0, armor: 0, handling: 0 }, best: {} };
}

function storeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* playing without a save is fine */ }
}

const save = loadSave();

function rankName() {
  let name = RANKS[0].name;
  for (const r of RANKS) if (save.earned >= r.merits) name = r.name;
  return name;
}

// --- game state ------------------------------------------------------------
let screen = 'menu'; // menu | briefing | fly | result
let menuSel = 0;
let menuMode = 'missions'; // missions | hangar
let hangarSel = 0;
let time = 0;
let last = performance.now();

const game = {
  state: null,
  world: null,
  mission: null,
  missionIndex: 0,
  particles: new Particles(),
  rng: mulberry32(1),
  throttle: 0.7,
  cockpit: false,
  autopilot: false,
  paused: false,
  flash: 0,
  lastRing: 0,
  lastDrops: 0,
  lastHull: 100,
  lightningT: 5,
  contrailT: 0,
  result: null,
};

// A slow dawn drift behind the menu, so the title never sits on a flat colour.
const menuState = newState(MISSIONS[0], {});
const menuWorld = createWorld(MISSIONS[0]);

// --- missions --------------------------------------------------------------
function startMission(index, opts = {}) {
  const mission = ALL_MISSIONS[index];
  game.mission = mission;
  game.missionIndex = index;
  game.state = newState(mission, save.upgrades);
  game.world = createWorld(mission);
  game.particles = new Particles();
  game.rng = mulberry32(mission.seed * 7 + 3);
  game.throttle = 0.7;
  game.cockpit = !!opts.cockpit;
  game.autopilot = !!opts.autopilot;
  game.paused = false;
  game.flash = 0;
  game.lastRing = 0;
  game.lastDrops = 0;
  game.lastHull = game.state.hull;
  game.lightningT = 4 + Math.random() * 5;
  game.result = null;
  screen = 'fly';
  window.__emberwing = { state: game.state, startMission };
  // Warmup: fly the autopilot to a fixed distance (or time) so a
  // screenshot preset frames one chosen moment.
  if (opts.warmupDist) {
    let guard = 0;
    while (game.state.status === 'flying' && game.state.dist < opts.warmupDist && guard++ < 40000) {
      step(game.state, autopilotInput(game.state, 1 / 60), 1 / 60, game.rng);
    }
    game.lastRing = game.state.ringsHit;
    game.lastDrops = game.state.dropsDone;
    game.lastHull = game.state.hull;
  } else if (opts.warmup) {
    const steps = Math.round(opts.warmup * 60);
    for (let i = 0; i < steps && game.state.status === 'flying'; i++) {
      step(game.state, autopilotInput(game.state, 1 / 60), 1 / 60, game.rng);
    }
    game.lastRing = game.state.ringsHit;
    game.lastDrops = game.state.dropsDone;
    game.lastHull = game.state.hull;
  }
}

function endMission() {
  const s = game.state;
  const medal = medalFor(game.mission, s);
  let merits = 0;
  if (medal) {
    const best = save.best[game.mission.id];
    if (!best || MEDAL_ORDER[medal] > MEDAL_ORDER[best]) {
      merits = MEDAL_MERITS[medal];
      save.merits += merits;
      save.earned += merits;
      save.best[game.mission.id] = medal;
      storeSave();
    }
  }
  game.result = {
    mission: game.mission,
    medal,
    time: s.time,
    ringsHit: s.ringsHit,
    rings: s.course.rings.length,
    dropsDone: s.dropsDone,
    beaconsLit: s.beaconsLit,
    hull: Math.round(s.hull),
    fuel: s.fuel / s.fuelMax,
    reason: s.reason,
    merits,
    crashed: s.status !== 'complete',
  };
  if (s.status === 'complete') audio.fanfare(medal);
  else audio.explosion();
  screen = 'result';
}

// --- update ----------------------------------------------------------------
function update(dt) {
  if (screen !== 'fly' || game.paused) return;
  const s = game.state;
  if (!s || s.status !== 'flying') return;

  let inp;
  if (game.autopilot) {
    inp = autopilotInput(s, dt);
    game.throttle = inp.throttle;
  } else {
    const f = input.flight(game.throttle);
    game.throttle = clamp(game.throttle + f.throttleDelta * dt, 0, 1);
    inp = { steer: f.steer, pitch: f.pitch, throttle: game.throttle, drop: f.drop };
  }
  step(s, inp, dt, game.rng);

  // Ring threaded: gold burst at the jet, a chime, a little flash.
  if (s.ringsHit > game.lastRing) {
    const jp = jetPos(W, H);
    game.particles.ringBurst(jp.x, jp.y - 40);
    audio.ring();
    game.flash = Math.max(game.flash, 0.25);
    game.lastRing = s.ringsHit;
  }
  if (s.dropsDone > game.lastDrops) {
    audio.drop();
    game.lastDrops = s.dropsDone;
  }
  // Hull lost: something hit us — shake, thud, sparks at the jet.
  if (s.hull < game.lastHull) {
    const jp = jetPos(W, H);
    game.particles.burst(jp.x, jp.y, 18, '#ff7a3c', 200, 0.7);
    audio.thud();
    game.lastHull = s.hull;
  }
  // Contrail off the wingtips while flying, thicker in a hard turn.
  game.contrailT -= dt;
  if (game.contrailT <= 0) {
    const jp = jetPos(W, H);
    const hard = Math.abs(s.vx) > 55;
    game.particles.contrail(jp.x - 52, jp.y + 18, -40, 30);
    game.particles.contrail(jp.x + 52, jp.y + 18, -40, 30);
    if (hard) game.particles.contrail(jp.x, jp.y + 24, -30, 40);
    game.contrailT = 0.06;
  }
  game.particles.update(dt);
  game.flash = Math.max(0, game.flash - dt * 1.8);

  // Storm lightning: a flash and a low rumble every few seconds.
  if (game.world.sky.rain) {
    game.lightningT -= dt;
    if (game.lightningT <= 0) {
      game.flash = 0.85;
      audio.noiseBurst(0.5, 0.1);
      game.lightningT = 4 + Math.random() * 6;
    }
  }

  audio.update(game.throttle, Math.min(1, s.speed / 300), true);
  if (s.status !== 'flying') endMission();
}

// --- render ----------------------------------------------------------------
function render() {
  ctx.clearRect(0, 0, W, H);
  if (screen === 'menu') {
    menuState.dist += 0.35;
    if (menuState.dist > 8200) menuState.dist = 0;
    menuState.time = time;
    drawWorld(ctx, menuState, menuWorld, { w: W, h: H, cockpit: false, time, menu: true });
    ctx.fillStyle = 'rgba(6,8,16,0.45)';
    ctx.fillRect(0, 0, W, H);
    drawMenu(ctx);
  } else if (screen === 'briefing') {
    drawWorld(ctx, menuState, menuWorld, { w: W, h: H, cockpit: false, time, menu: true });
    ctx.fillStyle = 'rgba(6,8,16,0.55)';
    ctx.fillRect(0, 0, W, H);
    drawBriefing(ctx);
  } else if (screen === 'fly') {
    const s = game.state;
    const shake = s.shake;
    ctx.save();
    if (shake > 0.02) {
      ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    }
    if (game.cockpit) {
      drawCockpit(ctx, s, game.world, { w: W, h: H, time });
    } else {
      drawWorld(ctx, s, game.world, { w: W, h: H, cockpit: false, time });
      drawJet(ctx, s, W, H, time);
    }
    game.particles.draw(ctx);
    ctx.restore();
    if (game.world.sky.rain) drawRain(ctx, time);
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(235,240,255,${(game.flash * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawHUD(ctx, s, { w: W, h: H, time, cockpit: game.cockpit, autopilot: game.autopilot });
    if (game.paused) {
      ctx.fillStyle = 'rgba(6,8,16,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.fillStyle = '#f2f4f8';
      ctx.fillText('PAUSED', W / 2, H / 2 - 10);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillStyle = '#aab2c0';
      ctx.fillText('P to resume · ESC to abandon the sortie', W / 2, H / 2 + 34);
    }
  } else if (screen === 'result') {
    if (game.state) {
      drawWorld(ctx, game.state, game.world, { w: W, h: H, cockpit: false, time });
      ctx.fillStyle = 'rgba(6,8,16,0.55)';
      ctx.fillRect(0, 0, W, H);
    }
    drawResult(ctx);
  }
}

function drawRain(ctx, time) {
  ctx.strokeStyle = 'rgba(180,200,230,0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = ((i * 137.5 + time * 320) % (W + 40)) - 20;
    const y = ((i * 89.3 + time * 900) % (H + 40)) - 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7, y + 16);
    ctx.stroke();
  }
}

// --- menu ------------------------------------------------------------------
function drawMenu(ctx) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Title block.
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillStyle = '#ffb52e';
  ctx.fillText('EMBERWING', 60, 128);
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText('S T O R M F R O N T   C A M P A I G N', 62, 162);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#c8cfdb';
  ctx.fillText(`Pilot ${rankName()}  ·  ${save.merits} merits  ·  v3`, 62, 190);

  if (menuMode === 'missions') {
    // Mission list.
    ALL_MISSIONS.forEach((m, i) => {
      const y = 236 + i * 62;
      const sel = i === menuSel;
      if (sel) {
        ctx.fillStyle = 'rgba(255,181,46,0.16)';
        ctx.fillRect(56, y - 30, 560, 52);
        ctx.strokeStyle = '#ffb52e';
        ctx.lineWidth = 2;
        ctx.strokeRect(56, y - 30, 560, 52);
      }
      ctx.font = sel ? 'bold 24px system-ui, sans-serif' : '24px system-ui, sans-serif';
      ctx.fillStyle = sel ? '#ffe9a8' : '#f2f4f8';
      ctx.fillText(m.name, 76, y);
      const best = save.best[m.id];
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = best === 'gold' ? '#ffd76a' : best === 'silver' ? '#d7dde8' : best ? '#e8a92c' : '#8b93a5';
      ctx.fillText(
        best ? `★ ${best.toUpperCase()}` : m.landing ? `LANDING · ${m.rings} GATES` : `${m.rings} GATES`,
        76,
        y + 22,
      );
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8b93a5';
      ctx.fillText(m.parGold ? `PAR ${m.parGold}s` : 'ENDLESS', 596, y);
      ctx.textAlign = 'left';
    });
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#aab2c0';
    ctx.fillText('↑↓ choose mission · ENTER briefing · H hangar · M mute', 62, 236 + ALL_MISSIONS.length * 62 + 16);
  } else {
    // Hangar: spend merits on the jet.
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#f2f4f8';
    ctx.fillText('HANGAR — spend merits on the jet', 62, 232);
    UPGRADE_KEYS.forEach((key, i) => {
      const u = UPGRADES[key];
      const level = save.upgrades[key];
      const y = 282 + i * 62;
      const sel = i === hangarSel;
      if (sel) {
        ctx.fillStyle = 'rgba(255,181,46,0.16)';
        ctx.fillRect(56, y - 30, 560, 52);
        ctx.strokeStyle = '#ffb52e';
        ctx.lineWidth = 2;
        ctx.strokeRect(56, y - 30, 560, 52);
      }
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillStyle = '#f2f4f8';
      ctx.fillText(u.name, 76, y);
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillStyle = '#aab2c0';
      ctx.fillText(u.blurb, 76, y + 20);
      // Level pips.
      for (let p = 0; p < u.max; p++) {
        ctx.fillStyle = p < level ? '#ffb52e' : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(470 + p * 24, y - 6, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = 'right';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = level >= u.max ? '#39d353' : save.merits >= u.costs[level] ? '#ffe9a8' : '#8b93a5';
      ctx.fillText(level >= u.max ? 'MAXED' : `${u.costs[level]} merits`, 596, y);
      ctx.textAlign = 'left';
    });
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#aab2c0';
    ctx.fillText('↑↓ choose part · ENTER buy · H back to missions', 62, 282 + UPGRADE_KEYS.length * 62 + 16);
  }

  // Controls footer.
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#8b93a5';
  ctx.fillText('Fly: arrows / WASD · Shift throttle up · Ctrl throttle down · Space drop · G autopilot · C cockpit · P pause', 62, H - 28);
}

function drawBriefing(ctx) {
  const m = ALL_MISSIONS[menuSel];
  const cx = W / 2;
  ctx.fillStyle = 'rgba(8,10,18,0.88)';
  ctx.strokeStyle = 'rgba(255,181,46,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - 330, 150, 660, 440, 16);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillStyle = '#ffb52e';
  ctx.fillText(m.name.toUpperCase(), cx, 218);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = '#e8ecf2';
  wrapText(ctx, m.brief, cx, 262, 580, 26);
  const lines = [
    `GATES  ${m.rings}`,
    m.drops ? `SUPPLY DROPS  ${m.drops}` : null,
    m.beacons ? `BEACONS  ${m.beacons}` : null,
    m.landing ? 'LAND ON THE STRIP TO FINISH' : 'LAST GATE ENDS THE FLIGHT',
    m.parGold ? `GOLD PAR  ${m.parGold}s  ·  SILVER PAR  ${m.parSilver}s` : 'NO CLOCK — FLY THEM ALL',
    save.best[m.id] ? `YOUR BEST  ★ ${save.best[m.id].toUpperCase()}` : 'NOT FLOWN YET',
  ].filter(Boolean);
  ctx.font = '19px system-ui, sans-serif';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === lines.length - 1 && save.best[m.id] ? '#ffd76a' : '#c8cfdb';
    ctx.fillText(line, cx, 372 + i * 30);
  });
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText('ENTER — LAUNCH   ·   ESC — BACK', cx, 552);
}

function drawResult(ctx) {
  const r = game.result;
  const cx = W / 2;
  ctx.fillStyle = 'rgba(8,10,18,0.90)';
  ctx.strokeStyle = r.crashed ? 'rgba(255,90,90,0.55)' : 'rgba(255,181,46,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - 330, 140, 660, 470, 16);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 38px system-ui, sans-serif';
  ctx.fillStyle = r.crashed ? '#ff5a5a' : '#ffb52e';
  ctx.fillText(r.crashed ? 'SORTIE LOST' : 'MISSION COMPLETE', cx, 208);
  if (r.medal) {
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillStyle = r.medal === 'gold' ? '#ffd76a' : r.medal === 'silver' ? '#d7dde8' : '#e8a92c';
    ctx.fillText(`★ ${r.medal.toUpperCase()} ★`, cx, 282);
  } else {
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#c8cfdb';
    ctx.fillText(r.reason, cx, 282);
  }
  const stats = [
    `TIME  ${fmtClock(r.time)}`,
    `GATES  ${r.ringsHit}/${r.rings}`,
    r.mission.drops ? `DROPS  ${r.dropsDone}/${r.mission.drops}` : null,
    r.mission.beacons ? `BEACONS  ${r.beaconsLit}/${r.mission.beacons}` : null,
    `HULL  ${r.hull}%   ·   FUEL  ${Math.round(r.fuel * 100)}%`,
    r.merits ? `+${r.merits} MERITS EARNED` : null,
  ].filter(Boolean);
  ctx.font = '20px system-ui, sans-serif';
  stats.forEach((line, i) => {
    ctx.fillStyle = line.startsWith('+') ? '#39d353' : '#e8ecf2';
    ctx.fillText(line, cx, 336 + i * 32);
  });
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText('ENTER — MENU   ·   R — FLY AGAIN', cx, 566);
}

function fmtClock(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}

// --- input routing ---------------------------------------------------------
function handleKeys() {
  audio.ensure();
  if (input.wasPressed('m')) {
    const muted = audio.toggleMute();
    void muted;
  }
  if (screen === 'menu') {
    if (input.wasPressed('h')) menuMode = menuMode === 'missions' ? 'hangar' : 'missions';
    if (input.wasPressed('arrowup') || input.wasPressed('w')) {
      if (menuMode === 'missions') menuSel = (menuSel + ALL_MISSIONS.length - 1) % ALL_MISSIONS.length;
      else hangarSel = (hangarSel + UPGRADE_KEYS.length - 1) % UPGRADE_KEYS.length;
      audio.click();
    }
    if (input.wasPressed('arrowdown') || input.wasPressed('s')) {
      if (menuMode === 'missions') menuSel = (menuSel + 1) % ALL_MISSIONS.length;
      else hangarSel = (hangarSel + 1) % UPGRADE_KEYS.length;
      audio.click();
    }
    if (input.wasPressed('enter')) {
      if (menuMode === 'missions') {
        screen = 'briefing';
        audio.click();
      } else {
        buyUpgrade();
      }
    }
  } else if (screen === 'briefing') {
    if (input.wasPressed('enter')) {
      audio.click();
      startMission(menuSel);
    }
    if (input.wasPressed('escape')) screen = 'menu';
  } else if (screen === 'fly') {
    if (input.wasPressed('g')) {
      game.autopilot = !game.autopilot;
      audio.click();
    }
    if (input.wasPressed('c')) {
      game.cockpit = !game.cockpit;
      audio.click();
    }
    if (input.wasPressed('p')) game.paused = !game.paused;
    if (input.wasPressed('escape')) {
      audio.update(0, 0, false);
      screen = 'menu';
    }
  } else if (screen === 'result') {
    if (input.wasPressed('enter')) screen = 'menu';
    if (input.wasPressed('r')) startMission(game.missionIndex);
  }
}

function buyUpgrade() {
  const key = UPGRADE_KEYS[hangarSel];
  const u = UPGRADES[key];
  const level = save.upgrades[key];
  if (level >= u.max) return;
  const cost = u.costs[level];
  if (save.merits < cost) return;
  save.merits -= cost;
  save.upgrades[key] = level + 1;
  storeSave();
  audio.ring();
}

// --- shot presets ----------------------------------------------------------
function applyShot() {
  const shot = parseShot(window.location.search);
  if (!shot) return;
  if (shot.screen === 'menu') {
    screen = 'menu';
    return;
  }
  if (shot.screen === 'complete') {
    const mission = ALL_MISSIONS[shot.mission] || MISSIONS[3];
    game.mission = mission;
    game.missionIndex = shot.mission || 3;
    game.state = newState(mission, save.upgrades);
    game.state.status = 'complete';
    game.state.time = shot.time || 61.1;
    game.state.ringsHit = game.state.course.rings.length;
    game.state.hull = 100;
    game.state.fuel = game.state.fuelMax * 0.97;
    game.state.dist = mission.length - 120;
    game.state.y = 120;
    game.world = createWorld(mission);
    game.result = {
      mission,
      medal: shot.medal || 'gold',
      time: game.state.time,
      ringsHit: game.state.ringsHit,
      rings: game.state.course.rings.length,
      dropsDone: 0,
      beaconsLit: 0,
      hull: 100,
      fuel: 0.97,
      reason: 'Course complete.',
      merits: 3,
      crashed: false,
    };
    screen = 'result';
    return;
  }
  // Flying presets: warm the autopilot to the chosen moment.
  startMission(shot.mission ?? 0, {
    autopilot: !!shot.autopilot,
    warmupDist: shot.warmupDist,
    warmup: shot.warmup,
    cockpit: !!shot.cockpit,
  });
}

// --- main loop -------------------------------------------------------------
window.__emberwing = { state: null, startMission };

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt;
  handleKeys();
  update(dt);
  render();
  requestAnimationFrame(frame);
}

applyShot();
requestAnimationFrame(frame);
