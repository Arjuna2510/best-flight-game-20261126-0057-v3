// EMBERWING v3 — the heads-up display.
// Big, high-contrast, dark-panelled: altitude and speed tapes on the
// flanks, a wide compass strip up top, fuel and hull bars down low, and
// warnings that shout before the jet does. In cockpit view the panel
// carries the numbers, so the HUD thins down to objectives + warnings.
import { WORLD } from './config.js';

const PANEL = 'rgba(8,10,18,0.62)';
const PANEL_EDGE = 'rgba(255,255,255,0.16)';
const INK = '#f2f4f8';
const DIM = '#aab2c0';
const AMBER = '#ffb52e';
const GREEN = '#39d353';
const RED = '#ff5a5a';

function panel(ctx, x, y, w, h, r = 10) {
  ctx.fillStyle = PANEL;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function headingOf(state) {
  const deg = (Math.atan2(state.vx, Math.max(1, state.speed)) * 180) / Math.PI;
  return ((360 + deg) % 360 + 360) % 360;
}

function compassLabel(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (d === 0) return 'N';
  if (d === 90) return 'E';
  if (d === 180) return 'S';
  if (d === 270) return 'W';
  return String(d).padStart(3, '0');
}

export function drawHUD(ctx, state, view) {
  const { w, h, time, cockpit, autopilot } = view;
  const m = state.mission;
  const kt = Math.round(state.speed * 1.94384);
  const ft = Math.round(state.y * 3.28084);
  const hdg = headingOf(state);

  drawObjectives(ctx, state, w, h, time);
  drawCompass(ctx, w, h, hdg);
  drawWarnings(ctx, state, w, h, time, autopilot);
  if (cockpit) return; // the panel below carries the numbers
  drawTape(ctx, 18, h, ft, 'FT', 100, 'ALT');
  drawTape(ctx, w - 18, h, kt, 'KT', 20, 'SPD');
  drawBars(ctx, state, w, h);
  drawClock(ctx, state, w, h);
}

// Top-left: what the mission wants, and how far along we are.
function drawObjectives(ctx, state, w, h, time) {
  const m = state.mission;
  const lines = [`${m.name.toUpperCase()}`];
  lines.push(`GATES  ${state.ringsHit}/${state.course.rings.length}`);
  if (m.drops) lines.push(`DROPS  ${state.dropsDone}/${m.drops}`);
  if (m.beacons) lines.push(`BEACONS  ${state.beaconsLit}/${m.beacons}`);
  if (m.landing) lines.push(state.landing ? 'FINAL: LAND ON THE STRIP' : `STRIP IN ${Math.max(0, Math.round(m.length - state.dist))}m`);
  const bw = 250;
  const bh = 22 + lines.length * 24;
  panel(ctx, 16, 14, bw, bh);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? 'bold 17px system-ui, sans-serif' : '15px system-ui, sans-serif';
    ctx.fillStyle = i === 0 ? AMBER : INK;
    ctx.fillText(line, 30, 14 + 22 + i * 24);
  });
}

// Top-centre: a 380 px compass strip with a centre caret, and the
// heading readout in bold underneath it.
function drawCompass(ctx, w, h, hdg) {
  const cw = 380;
  const cx = w / 2;
  const cy = 30;
  panel(ctx, cx - cw / 2, 14, cw, 56, 10);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - cw / 2, 14, cw, 56);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = Math.floor((hdg - 62) / 15) * 15; d <= hdg + 62; d += 15) {
    const deg = ((d % 360) + 360) % 360;
    const x = cx + (d - hdg) * (cw / 124);
    const major = deg % 45 === 0;
    ctx.strokeStyle = major ? INK : DIM;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, cy + 12);
    ctx.lineTo(x, cy + (major ? 26 : 20));
    ctx.stroke();
    ctx.font = major ? 'bold 14px system-ui, sans-serif' : '11px system-ui, sans-serif';
    ctx.fillStyle = major ? INK : DIM;
    ctx.fillText(compassLabel(deg), x, cy + 2);
  }
  ctx.restore();
  // Centre caret.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy + 28);
  ctx.lineTo(cx + 7, cy + 28);
  ctx.lineTo(cx, cy + 38);
  ctx.closePath();
  ctx.fill();
  // Heading readout.
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(`HDG ${String(Math.round(hdg)).padStart(3, '0')}°`, cx, cy + 48);
}

// A vertical tape: the current value big and boxed in the middle, tick
// values stepping away above and below it.
function drawTape(ctx, edgeX, h, value, unit, step, label) {
  const cx = edgeX < 200 ? edgeX + 46 : edgeX - 46;
  const cy = h / 2;
  const tw = 92;
  const th = 250;
  panel(ctx, cx - tw / 2, cy - th / 2, tw, th);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(label, cx, cy - th / 2 + 16);
  // Ticks: two steps each way and out — the step right next to the
  // current-value box would hide behind it, so it is skipped.
  for (let i = -4; i <= 4; i++) {
    if (Math.abs(i) < 2) continue;
    const v = value + i * step;
    if (v < 0) continue;
    const y = cy - i * 22;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = DIM;
    ctx.fillText(String(v), cx, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - tw / 2 + 8, y);
    ctx.lineTo(cx - tw / 2 + 18, y);
    ctx.moveTo(cx + tw / 2 - 18, y);
    ctx.lineTo(cx + tw / 2 - 8, y);
    ctx.stroke();
  }
  // Current value, big and boxed.
  ctx.fillStyle = 'rgba(255,181,46,0.18)';
  ctx.fillRect(cx - tw / 2 + 4, cy - 24, tw - 8, 48);
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - tw / 2 + 4, cy - 24, tw - 8, 48);
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(String(value), cx, cy - 2);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(unit, cx, cy + 18);
}

// Bottom corners: fuel on the left, hull on the right. Bars go amber,
// then red, as they empty.
function drawBars(ctx, state, w, h) {
  const bw = 220;
  const bh = 46;
  const y = h - bh - 16;
  bar(ctx, 16, y, bw, bh, 'FUEL', state.fuel / state.fuelMax, state.fuel / state.fuelMax);
  bar(ctx, w - bw - 16, y, bw, bh, 'HULL', state.hull / state.hullMax, state.hull / state.hullMax);
}

function bar(ctx, x, y, w, h, label, frac, raw) {
  panel(ctx, x, y, w, h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(label, x + 12, y + 13);
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.fillText(`${Math.round(raw * 100)}%`, x + w - 12, y + 13);
  const color = frac > 0.5 ? GREEN : frac > 0.22 ? AMBER : RED;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + 12, y + h - 16, w - 24, 8);
  ctx.fillStyle = color;
  ctx.fillRect(x + 12, y + h - 16, (w - 24) * Math.max(0, Math.min(1, frac)), 8);
}

// Top-right: the clock and the throttle.
function drawClock(ctx, state, w, h) {
  panel(ctx, w - 186, 14, 170, 56);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(fmtTime(state.time), w - 30, 32);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(`THR ${Math.round(state.throttle * 100)}%`, w - 30, 56);
  // Throttle tick under the clock.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(w - 170, 66, 140, 5);
  ctx.fillStyle = AMBER;
  ctx.fillRect(w - 170, 66, 140 * state.throttle, 5);
}

// Centre-screen warnings, one line at a time, blinking when urgent.
function drawWarnings(ctx, state, w, h, time, autopilot) {
  const warns = [];
  if (state.fuel / state.fuelMax < 0.15) warns.push({ text: 'LOW FUEL', color: RED });
  if (state.hull / state.hullMax < 0.3) warns.push({ text: 'HULL CRITICAL', color: RED });
  if (state.y < 60 && state.vy < -5 && !state.landing) warns.push({ text: 'PULL UP', color: AMBER });
  if (state.landing && state.y < 120) warns.push({ text: 'GEAR DOWN — FINAL', color: GREEN });
  if (autopilot) warns.push({ text: 'AUTOPILOT', color: '#7fd4ff' });
  if (!warns.length) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  warns.forEach((warn, i) => {
    // Below the compass strip and its heading readout (which ends near
    // y=90), so the warnings never sit on top of the numbers.
    const y = 122 + i * 30;
    const blink = warn.color === RED ? 0.6 + 0.4 * Math.sin(time * 7) : 1;
    ctx.globalAlpha = blink;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(10,10,16,0.85)';
    ctx.strokeText(warn.text, w / 2, y);
    ctx.fillStyle = warn.color;
    ctx.fillText(warn.text, w / 2, y);
    ctx.globalAlpha = 1;
  });
}

export { headingOf };
