// HUD — glass instruments drawn over the 3D view: airspeed and altitude
// tapes, compass strip, throttle / fuel / hull bars, objective tracker,
// timer, warnings. All canvas, all readable at a glance.
// v3 legibility pass: numbers 26→34px bold, panels darker (0.62), bars
// thicker, compass wider with bigger heading readout. Layout zones are
// kept apart on purpose — top bar, side tapes, bottom bars + compass never
// overlap at 1280x800 (v2 had two overlaps on its first visual pass).
export class Hud {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
  }

  panel(ctx, x, y, w, h, alpha = 0.62) {
    ctx.fillStyle = `rgba(8, 12, 22, ${alpha})`;
    ctx.strokeStyle = 'rgba(140, 180, 230, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  // cockpit=true: only the top bar, reticle and warnings — the dashboard
  // panel already carries speed, altitude, heading, throttle, fuel, hull.
  draw(s, input, t, W, H, cockpit = false) {
    const ctx = this.ctx;
    const knots = Math.round(s.speed * 1.94);
    const altFt = Math.round(s.y * 3.28084);
    const heading = Math.round(((s.x / 840) * 180 + 360) % 360);
    const speed01 = s.speed / 320;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // --- top bar: mission + objective + timer ---
    this.panel(ctx, 14, 12, W - 28, 50, 0.58);
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(`${s.mission.num}. ${s.mission.name.toUpperCase()}`, 26, 33);
    ctx.fillStyle = '#dfe8ff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const obj = s.mission.landing && s.nextRing >= s.course.rings.length
      ? 'LAND ON THE RUNWAY'
      : s.mission.drops
        ? `RINGS ${s.ringsHit}/${s.course.rings.length} · DROPS ${s.dropsDone}/${s.mission.drops}`
        : s.mission.beacons
          ? `RINGS ${s.ringsHit}/${s.course.rings.length} · BEACONS ${s.beaconsLit}/${s.mission.beacons}`
          : `RINGS ${s.ringsHit}/${s.course.rings.length}`;
    ctx.fillText(obj, 26, 53);
    // timer
    const mm = Math.floor(s.time / 60);
    const ss = Math.floor(s.time % 60).toString().padStart(2, '0');
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, monospace';
    ctx.fillText(`${mm}:${ss}`, W - 26, 38);
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#9fb4d8';
    const par = s.mission.parGold ? `GOLD ${Math.floor(s.mission.parGold / 60)}:${(s.mission.parGold % 60).toString().padStart(2, '0')}` : 'FREE FLIGHT';
    ctx.fillText(par, W - 26, 54);
    ctx.textAlign = 'left';

    if (cockpit) {
      // dashboard owns the rest; keep only the reticle + warnings below
      this.drawReticleWarnings(ctx, s, t, W, H);
      return;
    }

    // --- left: airspeed tape ---
    this.panel(ctx, 14, H - 168, 104, 150, 0.62);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('AIRSPEED', 26, H - 148);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, monospace';
    ctx.fillText(String(knots), 26, H - 110);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('knots', 26, H - 92);
    // speed bar
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(26, H - 76, 80, 10);
    ctx.fillStyle = speed01 > 0.85 ? '#ff7a3c' : '#7fd0ff';
    ctx.fillRect(26, H - 76, 80 * Math.min(1, speed01), 10);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`${Math.round(s.speed)} m/s`, 26, H - 54);

    // --- right: altitude tape ---
    this.panel(ctx, W - 118, H - 168, 104, 150, 0.62);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('ALTITUDE', W - 106, H - 148);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, monospace';
    ctx.fillText(String(altFt), W - 106, H - 110);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('feet', W - 106, H - 92);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W - 106, H - 76, 80, 10);
    ctx.fillStyle = s.y < 40 ? '#ff5a4e' : '#7fd0ff';
    ctx.fillRect(W - 106, H - 76, 80 * (s.y / 520), 10);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`${Math.round(s.y)} m`, W - 106, H - 54);

    // --- bottom center: compass strip ---
    const cw = 380;
    const cx0 = (W - cw) / 2;
    this.panel(ctx, cx0, H - 52, cw, 36, 0.58);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0, H - 52, cw, 36);
    ctx.clip();
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 12px system-ui, monospace';
    ctx.textAlign = 'center';
    for (let d = -180; d <= 540; d += 15) {
      const rel = ((d - heading + 540) % 360) - 180;
      const x = cx0 + cw / 2 + (rel / 90) * (cw / 2);
      if (x < cx0 || x > cx0 + cw) continue;
      const label = d % 90 === 0
        ? ['N', 'E', 'S', 'W'][(((d % 360) + 360) % 360) / 90]
        : String((((d % 360) + 360) % 360)).padStart(3, '0');
      ctx.fillText(label, x, H - 30);
      ctx.fillRect(x, H - 24, 1, d % 45 === 0 ? 9 : 5);
    }
    ctx.restore();
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 7, H - 52);
    ctx.lineTo(W / 2 + 7, H - 52);
    ctx.lineTo(W / 2, H - 41);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px system-ui, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(heading).padStart(3, '0') + '°', W / 2, H - 20);
    ctx.textAlign = 'left';

    // --- bottom left: throttle / fuel / hull ---
    this.panel(ctx, 14, H - 52, 230, 36, 0.58);
    const bar = (x, label, frac, color) => {
      ctx.fillStyle = '#9fb4d8';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(label, x, H - 36);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, H - 32, 60, 8);
      ctx.fillStyle = color;
      ctx.fillRect(x, H - 32, 60 * Math.max(0, Math.min(1, frac)), 8);
    };
    bar(26, 'THR', s.throttle, '#ffd76a');
    bar(98, 'FUEL', s.fuel / s.fuelMax, s.fuel / s.fuelMax < 0.2 ? '#ff5a4e' : '#7dff9a');
    bar(170, 'HULL', s.hull / s.hullMax, s.hull / s.hullMax < 0.35 ? '#ff5a4e' : '#7fd0ff');

    this.drawReticleWarnings(ctx, s, t, W, H);
  }

  drawReticleWarnings(ctx, s, t, W, H) {
    // --- center reticle ---
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    const rx = W / 2;
    const ry = H * 0.42;
    ctx.beginPath();
    ctx.arc(rx, ry, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx - 22, ry);
    ctx.lineTo(rx - 16, ry);
    ctx.moveTo(rx + 16, ry);
    ctx.lineTo(rx + 22, ry);
    ctx.moveTo(rx, ry - 22);
    ctx.lineTo(rx, ry - 16);
    ctx.moveTo(rx, ry + 16);
    ctx.lineTo(rx, ry + 22);
    ctx.stroke();

    // --- warnings ---
    const warn = [];
    if (s.y < 45 && s.status === 'flying') warn.push(['TERRAIN', '#ff5a4e']);
    if (s.fuel / s.fuelMax < 0.2) warn.push(['LOW FUEL', '#ffb35e']);
    if (s.speed < 70 && s.throttle < 0.4 && s.status === 'flying') warn.push(['STALL', '#ff5a4e']);
    if (warn.length) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px system-ui, sans-serif';
      warn.forEach(([txt, col], i) => {
        const blink = Math.sin(t * 8) > -0.2;
        if (!blink) return;
        ctx.fillStyle = col;
        ctx.fillText(txt, W / 2, H * 0.30 + i * 32);
      });
      ctx.textAlign = 'left';
    }
  }
}
