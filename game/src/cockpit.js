// EMBERWING v3 — the cockpit view (C key).
// First person through the canopy: the same world, a camera at the jet's
// nose, then the frame — canopy arch, side pillars, nose cone — and a
// lit instrument panel across the bottom. Every needle is live: airspeed
// and altitude dials, an artificial horizon ball, a heading rose, a fuel
// gauge, and a digital speed / altitude / heading strip.
import { drawWorld } from './world.js';
import { headingOf } from './hud.js';

const PANEL_BG = '#0d1017';
const PANEL_EDGE = 'rgba(255,255,255,0.18)';
const FACE = '#141a24';
const INK = '#e8ecf2';
const DIM = '#9aa3b2';
const NEEDLE = '#ffb52e';
const AMBER = '#ffb52e';
const DIGITAL = '#7dff9a';

export function drawCockpit(ctx, state, world, view) {
  const { w, h, time } = view;
  drawWorld(ctx, state, world, { ...view, cockpit: true });
  drawCanopy(ctx, w, h);
  drawPanel(ctx, state, w, h, time);
}

// --- canopy frame ----------------------------------------------------------
function drawCanopy(ctx, w, h) {
  ctx.fillStyle = 'rgba(8,10,16,0.92)';
  // Top arch: a shallow band, deeper in the middle, never through the
  // instruments below it.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, 16);
  ctx.quadraticCurveTo(w / 2, 44, 0, 16);
  ctx.closePath();
  ctx.fill();
  // Side pillars, leaning in as they drop.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(64, 0);
  ctx.lineTo(26, h * 0.42);
  ctx.lineTo(0, h * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w - 64, 0);
  ctx.lineTo(w - 26, h * 0.42);
  ctx.lineTo(w, h * 0.46);
  ctx.closePath();
  ctx.fill();
  // Nose cone: the jet's own nose ahead and below, centreline stripe.
  const nose = ctx.createLinearGradient(0, h * 0.62, 0, h);
  nose.addColorStop(0, 'rgba(20,24,34,0.0)');
  nose.addColorStop(1, 'rgba(14,17,25,0.95)');
  ctx.fillStyle = nose;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 110, h);
  ctx.lineTo(w / 2, h * 0.60);
  ctx.lineTo(w / 2 + 110, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.66);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
}

// --- instrument panel ------------------------------------------------------
function drawPanel(ctx, state, w, h, time) {
  const top = h * 0.64;
  const pad = 10;
  // Panel body with a lit top edge.
  ctx.fillStyle = PANEL_BG;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(pad, top, w - pad * 2, h - top - pad, 14);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,190,90,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad + 14, top);
  ctx.lineTo(w - pad - 14, top);
  ctx.stroke();

  const kt = Math.round(state.speed * 1.94384);
  const ft = Math.round(state.y * 3.28084);
  const hdg = headingOf(state);

  // Digital strip across the panel's top.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 26px ui-monospace, Menlo, monospace';
  ctx.fillStyle = DIGITAL;
  ctx.shadowColor = 'rgba(125,255,154,0.6)';
  ctx.shadowBlur = 8;
  ctx.fillText(`${kt} KT      ${ft} FT      HDG ${String(Math.round(hdg)).padStart(3, '0')}°`, w / 2, top + 30);
  ctx.shadowBlur = 0;

  // Dials row.
  const rowY = top + (h - top) / 2 + 22;
  const r = Math.min(58, (h - top - 70) / 2, w * 0.075);
  dial(ctx, w * 0.14, rowY, r, kt, 600, 'AIRSPEED', 'KT');
  dial(ctx, w * 0.32, rowY, r, ft, 2500, 'ALTITUDE', 'FT');
  horizonBall(ctx, state, w * 0.5, rowY, r + 6);
  headingRose(ctx, state, w * 0.68, rowY, r + 6);
  fuelGauge(ctx, state, w * 0.86, rowY, r);

  // Labels under the dials.
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText('AIRSPEED', w * 0.14, rowY + r + 18);
  ctx.fillText('ALTITUDE', w * 0.32, rowY + r + 18);
  ctx.fillText('ATTITUDE', w * 0.5, rowY + r + 24);
  ctx.fillText('HEADING', w * 0.68, rowY + r + 24);
  ctx.fillText('FUEL', w * 0.86, rowY + r + 18);
}

// A round gauge: dark face, lit ticks, a needle driven by value/max.
function dial(ctx, cx, cy, r, value, max, label, unit) {
  const frac = Math.max(0, Math.min(1, value / max));
  // Face.
  ctx.fillStyle = FACE;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Ticks across a 270° sweep, starting at 7:30.
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 9; i++) {
    const a = (-225 + i * 30) * (Math.PI / 180);
    const major = i % 3 === 0;
    const r1 = r - (major ? 12 : 7);
    const r2 = r - 2;
    ctx.lineWidth = major ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
    ctx.stroke();
    if (major) {
      ctx.font = 'bold 11px system-ui, sans-serif';
      const v = Math.round((max * i) / 9);
      ctx.fillText(String(v), cx + Math.sin(a) * (r - 24), cy - Math.cos(a) * (r - 24));
    }
  }
  // Needle.
  const na = (-225 + frac * 270) * (Math.PI / 180);
  ctx.strokeStyle = NEEDLE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(na) * (r - 8), cy - Math.cos(na) * (r - 8));
  ctx.stroke();
  ctx.fillStyle = NEEDLE;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  // Centre readout.
  ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
  ctx.fillStyle = DIGITAL;
  ctx.fillText(String(Math.round(value)), cx, cy + r * 0.42);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(unit, cx, cy + r * 0.62);
}

// Artificial horizon: a ball, blue sky over brown earth, rolled by the
// turn and pitched by the climb, with a fixed aircraft symbol on top.
function horizonBall(ctx, state, cx, cy, r) {
  const bank = Math.max(-0.5, Math.min(0.5, -state.vx * 0.004));
  const pitch = Math.max(-0.6, Math.min(0.6, state.vy * 0.008));
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = FACE;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.translate(cx, cy);
  ctx.rotate(bank);
  ctx.translate(0, pitch * r * 1.4);
  // Sky and earth halves.
  ctx.fillStyle = '#2f6fb4';
  ctx.fillRect(-r, -r, r * 2, r);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-r, 0, r * 2, r);
  // Horizon line.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.restore();
  // Rim.
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol: wings + dot, always level to the panel.
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy);
  ctx.lineTo(cx - r * 0.18, cy);
  ctx.moveTo(cx + r * 0.18, cy);
  ctx.lineTo(cx + r * 0.55, cy);
  ctx.stroke();
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

// Heading rose: the compass card turns under a fixed lubber line.
function headingRose(ctx, state, cx, cy, r) {
  const hdg = headingOf(state);
  ctx.fillStyle = FACE;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 15) {
    const a = ((d - hdg) * Math.PI) / 180;
    const major = d % 45 === 0;
    const r1 = r - (major ? 14 : 8);
    const r2 = r - 3;
    ctx.strokeStyle = major ? INK : DIM;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
    ctx.stroke();
    if (major) {
      const label = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d).padStart(3, '0');
      ctx.font = d % 90 === 0 ? 'bold 14px system-ui, sans-serif' : '10px system-ui, sans-serif';
      ctx.fillStyle = d % 90 === 0 ? AMBER : INK;
      ctx.fillText(label, cx + Math.sin(a) * (r - 28), cy - Math.cos(a) * (r - 28));
    }
  }
  ctx.restore();
  // Lubber line at the top.
  ctx.fillStyle = NEEDLE;
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy - r + 2);
  ctx.lineTo(cx + 7, cy - r + 2);
  ctx.lineTo(cx, cy - r + 12);
  ctx.closePath();
  ctx.fill();
  // Centre readout.
  ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
  ctx.fillStyle = DIGITAL;
  ctx.fillText(String(Math.round(hdg)).padStart(3, '0'), cx, cy + 4);
}

// Fuel: a vertical gauge with F at the top, E at the bottom, the fill
// amber below half and red below a quarter.
function fuelGauge(ctx, state, cx, cy, r) {
  const frac = Math.max(0, Math.min(1, state.fuel / state.fuelMax));
  const bw = 26;
  const bh = r * 2;
  const x = cx - bw / 2;
  const y = cy - bh / 2;
  ctx.fillStyle = FACE;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, 6);
  ctx.fill();
  ctx.stroke();
  const color = frac > 0.5 ? '#39d353' : frac > 0.22 ? '#ffb52e' : '#ff5a5a';
  ctx.fillStyle = color;
  const fh = (bh - 8) * frac;
  ctx.fillRect(x + 4, y + bh - 4 - fh, bw - 8, fh);
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('F', cx, y - 12);
  ctx.fillText('E', cx, y + bh + 12);
  ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,10,16,0.9)';
  ctx.strokeText(`${Math.round(frac * 100)}%`, cx, cy);
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(`${Math.round(frac * 100)}%`, cx, cy);
}
