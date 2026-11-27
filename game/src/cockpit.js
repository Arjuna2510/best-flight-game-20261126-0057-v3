// Cockpit view — first-person instruments. Press C in flight to switch
// between chase view and the cockpit; the ?shot=cockpit preset opens
// straight into it. The dashboard is a lit panel of real gauges: airspeed
// and altitude dials, an artificial horizon, a heading rose, and fuel —
// every needle driven by the live flight state, so the panel is a working
// instrument set, not a picture of one.
export class Cockpit {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // One round dial: dark face, luminous rim + tick marks, needle, label.
  dial(ctx, cx, cy, r, value01, label, sub) {
    // face
    ctx.fillStyle = '#0a0e18';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // lit rim
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
    ctx.stroke();
    // ticks
    ctx.strokeStyle = 'rgba(220, 235, 255, 0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const x0 = cx + Math.cos(a) * (r - 9);
      const y0 = cy + Math.sin(a) * (r - 9);
      const x1 = cx + Math.cos(a) * (r - (i % 5 === 0 ? 18 : 14));
      const y1 = cy + Math.sin(a) * (r - (i % 5 === 0 ? 18 : 14));
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // needle
    const na = -Math.PI * 0.75 + Math.max(0, Math.min(1, value01)) * Math.PI * 1.5;
    ctx.strokeStyle = '#ff5a4e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (r - 14), cy + Math.sin(na) * (r - 14));
    ctx.stroke();
    ctx.fillStyle = '#dfe8ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    // labels
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + r + 16);
    if (sub) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px system-ui, monospace';
      ctx.fillText(sub, cx, cy + r * 0.42);
    }
    ctx.textAlign = 'left';
  }

  // Artificial horizon: a ball split sky/ground, rolled by bank and
  // shifted by pitch, with a fixed wings marker on top.
  horizon(ctx, cx, cy, r, roll, pitch01) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(roll);
    const dy = pitch01 * r * 0.9;
    ctx.fillStyle = '#3a6fd9';
    ctx.fillRect(-r, -r + dy, r * 2, r);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-r, dy, r * 2, r);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, dy);
    ctx.lineTo(r, dy);
    ctx.stroke();
    ctx.restore();
    // rim + fixed wings
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r - 2, cy);
    ctx.lineTo(cx - r + 14, cy);
    ctx.moveTo(cx + r - 14, cy);
    ctx.lineTo(cx + r + 2, cy);
    ctx.stroke();
    // (no label under the horizon — the digital strip below the panel
    // would collide with it; the instrument is self-evident)
  }

  draw(s, input, t, W, H) {
    const ctx = this.ctx;
    const knots = Math.round(s.speed * 1.94);
    const altFt = Math.round(s.y * 3.28084);
    const heading = Math.round(((s.x / 840) * 180 + 360) % 360);
    const roll = -((input.steer || 0) * 0.45 + s.vx * 0.0012);
    const pitch01 = Math.max(-1, Math.min(1, s.vy / 75));

    // --- canopy frame: dark struts around the view (shallow arch, so it
    // never dips into the HUD top bar) ---
    ctx.fillStyle = 'rgba(10, 12, 22, 0.92)';
    // top arch
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, 18);
    ctx.quadraticCurveTo(W / 2, 40, 0, 18);
    ctx.closePath();
    ctx.fill();
    // center pillar
    ctx.fillRect(W / 2 - 7, 0, 14, 40);
    // side pillars
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(64, 0);
    ctx.lineTo(30, H * 0.62);
    ctx.lineTo(0, H * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W - 64, 0);
    ctx.lineTo(W - 30, H * 0.62);
    ctx.lineTo(W, H * 0.62);
    ctx.closePath();
    ctx.fill();
    // canopy glint
    ctx.fillStyle = 'rgba(190, 230, 255, 0.10)';
    ctx.beginPath();
    ctx.ellipse(W * 0.30, H * 0.16, W * 0.16, 26, -0.12, 0, Math.PI * 2);
    ctx.fill();

    // --- nose cone peeking over the panel ---
    ctx.fillStyle = '#2c3140';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 26, H - 188);
    ctx.quadraticCurveTo(W / 2, H - 216, W / 2 + 26, H - 188);
    ctx.lineTo(W / 2 + 18, H - 168);
    ctx.lineTo(W / 2 - 18, H - 168);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff7a3c';
    ctx.fillRect(W / 2 - 18, H - 176, 36, 3);

    // --- dashboard panel ---
    const py = H - 168;
    const grad = ctx.createLinearGradient(0, py, 0, H);
    grad.addColorStop(0, '#171c2a');
    grad.addColorStop(1, '#0a0d18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, py, W, 168);
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
    ctx.stroke();
    // glareshield glow line
    ctx.fillStyle = 'rgba(255, 215, 106, 0.25)';
    ctx.fillRect(0, py + 2, W, 2);

    // --- the five lit instruments ---
    const r = 46;
    const cy = py + 74;
    const hr = 56;
    this.dial(ctx, W * 0.12, cy, r, s.speed / 320, 'AIRSPEED', String(knots));
    this.dial(ctx, W * 0.30, cy, r, s.y / 520, 'ALTITUDE', String(altFt));
    this.horizon(ctx, W * 0.50, cy, hr, roll, pitch01);
    this.dial(ctx, W * 0.70, cy, r, heading / 360, 'HEADING', String(heading).padStart(3, '0') + '°');
    this.dial(ctx, W * 0.88, cy, r, s.fuel / s.fuelMax, 'FUEL', `${Math.round((s.fuel / s.fuelMax) * 100)}%`);

    // --- digital strip under the horizon: speed / alt / heading big ---
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, monospace';
    ctx.fillText(`${knots} KT   ·   ${altFt} FT   ·   HDG ${String(heading).padStart(3, '0')}°`, W / 2, H - 14);
    ctx.textAlign = 'left';
    // --- mode hint ---
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('COCKPIT — C for chase view', 16, py + 22);
  }
}
