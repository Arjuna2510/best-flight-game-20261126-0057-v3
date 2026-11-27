// Pseudo-3D world renderer — Canvas 2D only. The camera chases the jet:
// the world streams toward the player, rings grow as they close, mountains
// parallax past the horizon. Everything is seeded per mission.
// v3: the jet is drawn ~30% larger and lower in frame so the aircraft
// reads instantly in a screenshot, and the runway carries approach lights
// so the strip is unmistakable even from 2 km out.
import { PALETTES } from './config.js';
import { mulberry32, ridgeline, range } from './rng.js';

export class WorldRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.cx = this.W / 2;
    this.horizon = Math.round(this.H * 0.40);
    this.focal = this.H * 1.05;
    this.flash = 0; // lightning flash 0..1
    this.flashTimer = 4 + Math.random() * 4;
    this.rainDrops = [];
    for (let i = 0; i < 160; i++) {
      this.rainDrops.push({ x: Math.random(), y: Math.random(), l: 0.02 + Math.random() * 0.03 });
    }
    this.stars = [];
    const srng = mulberry32(7);
    for (let i = 0; i < 130; i++) {
      this.stars.push({ x: srng(), y: srng() * 0.38, r: 0.4 + srng() * 1.2, tw: srng() * Math.PI * 2 });
    }
  }

  resize(w, h) {
    this.cv.width = w;
    this.cv.height = h;
    this.W = w;
    this.H = h;
    this.cx = w / 2;
    this.horizon = Math.round(h * 0.40);
    this.focal = h * 1.05;
  }

  // Project a world point (lateral x, altitude y, distance dz ahead) to screen.
  project(x, y, dz, px, py) {
    if (dz < 8) dz = 8;
    const s = this.focal / dz;
    return {
      x: this.cx + (x - px) * s,
      y: this.horizon - (y - py) * s,
      s,
    };
  }

  drawSky(pal, t, night) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.45, pal.skyMid);
    g.addColorStop(0.62, pal.skyHorizon);
    g.addColorStop(1, pal.ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);

    // stars
    if (pal.stars > 0) {
      for (const st of this.stars) {
        const a = pal.stars * (0.5 + 0.5 * Math.sin(t * 1.4 + st.tw));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#dfe6ff';
        ctx.beginPath();
        ctx.arc(st.x * this.W, st.y * this.H, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // sun / moon with halo
    const sx = pal.sunX * this.W;
    const sy = pal.sunY * this.H;
    const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, this.H * 0.32);
    halo.addColorStop(0, pal.sun);
    halo.addColorStop(0.25, pal.sun + '55');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, pal.moon ? this.H * 0.035 : this.H * 0.045, 0, Math.PI * 2);
    ctx.fill();
    if (pal.moon) {
      ctx.fillStyle = 'rgba(120,130,170,0.5)';
      ctx.beginPath();
      ctx.arc(sx - 8, sy - 4, this.H * 0.012, 0, Math.PI * 2);
      ctx.arc(sx + 6, sy + 7, this.H * 0.008, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRidges(pal, px, seed) {
    const ctx = this.ctx;
    const layers = [
      { pts: ridgeline(mulberry32(seed + 1), 26, 26, 96, 26), color: pal.far, par: 0.10, base: 0.10 },
      { pts: ridgeline(mulberry32(seed + 2), 22, 14, 66, 20), color: pal.mid, par: 0.22, base: 0.05 },
      { pts: ridgeline(mulberry32(seed + 3), 18, 6, 40, 14), color: pal.near, par: 0.42, base: 0.0 },
    ];
    for (const L of layers) {
      const off = (px / 840) * this.W * L.par;
      const step = this.W / (L.pts.length - 1);
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(-4, this.horizon + 2);
      for (let i = 0; i < L.pts.length; i++) {
        let x = i * step - off;
        // wrap the ridge so it never runs out sideways
        x = ((x % (this.W + 80)) + this.W + 80) % (this.W + 80) - 40;
        ctx.lineTo(x, this.horizon - L.pts[i] * (this.H / 800) - L.base * this.H);
      }
      ctx.lineTo(this.W + 4, this.horizon + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawGround(pal, px, py, dist, canyon) {
    const ctx = this.ctx;
    // perspective ground: bands from near (bottom) to horizon
    const bands = 14;
    for (let i = bands - 1; i >= 0; i--) {
      const z0 = 30 + (i / bands) * (i / bands) * 2600;
      const z1 = 30 + ((i + 1) / bands) * ((i + 1) / bands) * 2600;
      const p0 = this.project(0, 0, z0, 0, py);
      const p1 = this.project(0, 0, z1, 0, py);
      const y0 = p0.y;
      const y1 = p1.y;
      if (y1 <= this.horizon) continue;
      ctx.fillStyle = i % 2 === 0 ? pal.ground : pal.groundLine;
      ctx.globalAlpha = 0.9;
      // lateral shift grows with depth so the ground slides under the jet
      const shift0 = -px * p0.s * 0.9;
      const shift1 = -px * p1.s * 0.9;
      ctx.beginPath();
      ctx.moveTo(this.cx + shift0 - this.W * 1.6 * p0.s / this.focal * this.H, y0);
      ctx.lineTo(this.cx + shift0 + this.W * 1.6 * p0.s / this.focal * this.H, y0);
      ctx.lineTo(this.cx + shift1 + this.W * 1.6 * p1.s / this.focal * this.H, y1);
      ctx.lineTo(this.cx + shift1 - this.W * 1.6 * p1.s / this.focal * this.H, y1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // winding river / road far ahead (kept faint and starting 600 m out —
    // a bright near segment reads as a slash across the frame, not a river)
    ctx.strokeStyle = pal.river;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = Math.max(1, this.H * 0.004);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const z = 600 + (i / 24) * 2000;
      const rx = Math.sin((dist + z) * 0.0011) * 320;
      const p = this.project(rx, 0, z, px, py);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // canyon walls: rock faces closing in on both sides
    if (canyon) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = pal.mid;
        ctx.beginPath();
        const pNear = this.project(side * 430, 0, 60, px, py);
        const pFar = this.project(side * 430, 0, 900, px, py);
        ctx.moveTo(side < 0 ? 0 : this.W, this.H);
        ctx.lineTo(pNear.x, pNear.y);
        ctx.lineTo(pFar.x, pFar.y);
        ctx.lineTo(side < 0 ? 0 : this.W, this.horizon + this.H * 0.06);
        ctx.closePath();
        ctx.fill();
        // rock strata lines
        ctx.strokeStyle = pal.far;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const z = 140 + k * 220;
          const a = this.project(side * 430, 30 + k * 40, z, px, py);
          const b = this.project(side * 430, 30 + k * 40, z + 160, px, py);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  drawClouds(pal, s, t, px, py) {
    const ctx = this.ctx;
    const drawPuff = (x, y, r, alpha, dark) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = dark ? 'rgba(30,28,48,0.92)' : pal.cloud;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.ellipse(x - r * 0.55, y + r * 0.1, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(x + r * 0.55, y + r * 0.08, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    // storm cells from the course
    for (const c of s.course.clouds) {
      const dz = c.dist - s.dist;
      if (dz < 20 || dz > 3200) continue;
      const p = this.project(c.x, c.y, dz, px, py);
      const dark = pal.rain === true;
      drawPuff(p.x, p.y, c.r * p.s * 0.9, dark ? 0.95 : 0.9, dark);
      // shadow on the ground below
      const g = this.project(c.x, 0, dz, px, py);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, c.r * p.s * 0.9, c.r * p.s * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // ambient drifting clouds (seeded, endless)
    const rng = mulberry32(4242);
    for (let i = 0; i < 10; i++) {
      const dz = 300 + rng() * 2600;
      const cx = (rng() * 2 - 1) * 900 + Math.sin(t * 0.02 + i) * 60;
      const cy = 300 + rng() * 160;
      const p = this.project(cx, cy, dz, px, py);
      drawPuff(p.x, p.y, (60 + rng() * 90) * p.s, 0.5, false);
    }
  }

  drawRain(dt) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(190, 210, 235, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const d of this.rainDrops) {
      d.y += dt * (1.6 + d.l * 22);
      d.x += dt * 0.12;
      if (d.y > 1.05) { d.y = -0.05; d.x = Math.random(); }
      if (d.x > 1.05) d.x = 0;
      const x = d.x * this.W;
      const y = d.y * this.H;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 6, y + d.l * this.H);
    }
    ctx.stroke();
  }

  drawLightning(dt, pal) {
    if (!pal.lightning) return;
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.flash = 1;
      this.flashTimer = 5 + Math.random() * 7;
    }
    if (this.flash > 0) {
      const ctx = this.ctx;
      ctx.globalAlpha = this.flash * 0.28;
      ctx.fillStyle = '#dfe8ff';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - dt * 2.4);
    }
  }

  drawRings(s, px, py) {
    const ctx = this.ctx;
    const rings = s.course.rings;
    for (let i = s.nextRing; i < rings.length; i++) {
      const r = rings[i];
      if (r.hit) continue;
      const dz = r.dist - s.dist;
      if (dz < 10) continue;
      if (dz > 3400) {
        // far marker on the horizon
        const p = this.project(r.x, r.y, 3400, px, py);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = i === s.nextRing ? '#ffd76a' : '#9fc4ff';
        ctx.beginPath();
        ctx.arc(p.x, this.horizon - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      const p = this.project(r.x, r.y, dz, px, py);
      const rad = Math.max(3, r.r * p.s);
      const isNext = i === s.nextRing;
      ctx.save();
      ctx.translate(p.x, p.y);
      // glow
      const glow = ctx.createRadialGradient(0, 0, rad * 0.4, 0, 0, rad * 1.5);
      glow.addColorStop(0, isNext ? 'rgba(255, 215, 106, 0.35)' : 'rgba(140, 190, 255, 0.22)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, rad * 1.5, 0, Math.PI * 2);
      ctx.fill();
      // torus
      ctx.strokeStyle = isNext ? '#ffd76a' : '#bcd8ff';
      ctx.lineWidth = Math.max(2, rad * 0.14);
      ctx.beginPath();
      ctx.ellipse(0, 0, rad, rad * 0.94, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = isNext ? '#fff3c4' : '#e8f2ff';
      ctx.lineWidth = Math.max(1, rad * 0.05);
      ctx.beginPath();
      ctx.ellipse(0, 0, rad * 0.86, rad * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      // chevrons pointing through
      ctx.fillStyle = isNext ? '#ffd76a' : '#bcd8ff';
      ctx.globalAlpha = 0.9;
      const ch = rad * 0.28;
      ctx.beginPath();
      ctx.moveTo(-ch, 0);
      ctx.lineTo(0, -ch * 0.7);
      ctx.lineTo(ch, 0);
      ctx.lineTo(0, ch * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // distance label on the next ring
      if (isNext && dz < 1600) {
        ctx.fillStyle = 'rgba(255, 240, 200, 0.95)';
        ctx.font = `bold ${Math.max(12, Math.min(18, rad * 0.24))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(dz)}m`, p.x, p.y + rad + 22);
      }
    }
  }

  drawBeacons(s, px, py, t) {
    const ctx = this.ctx;
    for (const b of s.course.beacons) {
      const dz = b.dist - s.dist;
      if (dz < 10 || dz > 3000) continue;
      const p = this.project(b.x, b.y, dz, px, py);
      const pulse = 0.6 + 0.4 * Math.sin(t * 5);
      const col = b.lit ? '#7dff9a' : '#ff5a4e';
      const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 60 * p.s + 20);
      glow.addColorStop(0, col);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = pulse * 0.7;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 60 * p.s + 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(3, 7 * p.s), 0, Math.PI * 2);
      ctx.fill();
      // light pillar
      ctx.globalAlpha = 0.25 * pulse;
      ctx.fillStyle = col;
      ctx.fillRect(p.x - 2, p.y - 260 * p.s, 4, 260 * p.s);
      ctx.globalAlpha = 1;
    }
  }

  drawRunway(s, px, py) {
    const ctx = this.ctx;
    const m = s.mission;
    const start = m.length - 600;
    const end = m.length;
    const p0 = this.project(0, 0, Math.max(20, start - s.dist), px, py);
    const p1 = this.project(0, 0, Math.max(20, end - s.dist), px, py);
    if (end - s.dist < 10) return;
    const w0 = 26 * p0.s;
    const w1 = 26 * p1.s;
    // strip fill kept light enough to read against dark ground at dusk/night
    ctx.fillStyle = '#3a3f4a';
    ctx.beginPath();
    ctx.moveTo(p0.x - w0, p0.y);
    ctx.lineTo(p0.x + w0, p0.y);
    ctx.lineTo(p1.x + w1, p1.y);
    ctx.lineTo(p1.x - w1, p1.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 230, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // centerline dashes
    ctx.fillStyle = '#f5d76a';
    for (let k = 0; k < 6; k++) {
      const d = start + (k + 0.5) * 100;
      const dz = d - s.dist;
      if (dz < 20) continue;
      const p = this.project(0, 0, dz, px, py);
      const w = 2.2 * p.s;
      ctx.fillRect(p.x - w / 2, p.y - 1, w, 2);
    }
    // edge lights — bigger and brighter in v3 so the strip reads at range
    for (const side of [-1, 1]) {
      for (let k = 0; k < 7; k++) {
        const d = start + k * 100;
        const dz = d - s.dist;
        if (dz < 20) continue;
        const p = this.project(side * 26, 0, dz, px, py);
        ctx.fillStyle = '#8dff9e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2, 4.5 * p.s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // approach lights: a bright white/amber row leading to the threshold,
    // so the runway is unmistakable from 2 km out
    for (let k = 0; k < 5; k++) {
      const d = start - 60 - k * 60;
      const dz = d - s.dist;
      if (dz < 20) continue;
      const p = this.project(0, 0, dz, px, py);
      ctx.fillStyle = k % 2 === 0 ? '#ffffff' : '#ffb35e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, 4 * p.s), 0, Math.PI * 2);
      ctx.fill();
    }
    // threshold bar
    const pt = this.project(0, 0, Math.max(20, start - s.dist), px, py);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pt.x - 26 * pt.s, pt.y - 1.5, 52 * pt.s, 3);
  }

  drawPlane(s, input, t, particles) {
    const ctx = this.ctx;
    const px = this.cx;
    const py = this.H * 0.76; // v3: lower in frame, more sky ahead
    const scale = (this.H / 800) * 1.3; // v3: ~30% larger — the aircraft must read at a glance
    const roll = -((input.steer || 0) * 0.45 + s.vx * 0.0012);
    const pitchVis = -s.vy * 0.004;

    // contrails from the wingtips
    if (s.speed > 60 && s.status === 'flying') {
      const tip = 74 * scale;
      particles.contrail(px - tip, py + 6, -40, 30);
      particles.contrail(px + tip, py + 6, -40, 30);
      if (Math.random() < 0.25) particles.ember(px + (Math.random() - 0.5) * 30, py + 26);
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(roll);
    ctx.scale(1 + pitchVis * 0.1, 1 - pitchVis * 0.06);

    // afterburner flame — lit from throttle 0.4 up, so the approach
    // (throttle ~0.42) still shows a flame in the hero shot
    const throttle = s.throttle;
    if (throttle > 0.4 && s.status === 'flying') {
      // minimum visible length even at approach throttle, then grows
      const fl = (22 + (throttle - 0.35) * 150) * scale * (0.8 + Math.random() * 0.5);
      const grad = ctx.createLinearGradient(0, 18 * scale, 0, 18 * scale + fl);
      grad.addColorStop(0, '#fff3b0');
      grad.addColorStop(0.4, '#ff9a3c');
      grad.addColorStop(1, 'rgba(255, 80, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-9 * scale, 16 * scale);
      ctx.lineTo(0, 16 * scale + fl);
      ctx.lineTo(9 * scale, 16 * scale);
      ctx.closePath();
      ctx.fill();
    }

    // wings (swept back)
    ctx.fillStyle = '#2c3140';
    ctx.beginPath();
    ctx.moveTo(-8 * scale, 2 * scale);
    ctx.lineTo(-86 * scale, 26 * scale);
    ctx.lineTo(-78 * scale, 34 * scale);
    ctx.lineTo(-6 * scale, 16 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8 * scale, 2 * scale);
    ctx.lineTo(86 * scale, 26 * scale);
    ctx.lineTo(78 * scale, 34 * scale);
    ctx.lineTo(6 * scale, 16 * scale);
    ctx.closePath();
    ctx.fill();
    // wing edge lights
    ctx.fillStyle = '#ff5a4e';
    ctx.fillRect(-86 * scale, 24 * scale, 5 * scale, 3 * scale);
    ctx.fillStyle = '#7dff9a';
    ctx.fillRect(81 * scale, 24 * scale, 5 * scale, 3 * scale);

    // tail fins
    ctx.fillStyle = '#232733';
    ctx.beginPath();
    ctx.moveTo(-14 * scale, -6 * scale);
    ctx.lineTo(-26 * scale, -34 * scale);
    ctx.lineTo(-16 * scale, -34 * scale);
    ctx.lineTo(-4 * scale, -8 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14 * scale, -6 * scale);
    ctx.lineTo(26 * scale, -34 * scale);
    ctx.lineTo(16 * scale, -34 * scale);
    ctx.lineTo(4 * scale, -8 * scale);
    ctx.closePath();
    ctx.fill();

    // fuselage — bright silver so the jet reads against dark ground
    const body = ctx.createLinearGradient(-14 * scale, 0, 14 * scale, 0);
    body.addColorStop(0, '#5a6376');
    body.addColorStop(0.5, '#c8d0dc');
    body.addColorStop(1, '#4a5262');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -52 * scale);
    ctx.quadraticCurveTo(13 * scale, -30 * scale, 13 * scale, -2 * scale);
    ctx.quadraticCurveTo(13 * scale, 16 * scale, 6 * scale, 20 * scale);
    ctx.lineTo(-6 * scale, 20 * scale);
    ctx.quadraticCurveTo(-13 * scale, 16 * scale, -13 * scale, -2 * scale);
    ctx.quadraticCurveTo(-13 * scale, -30 * scale, 0, -52 * scale);
    ctx.fill();

    // canopy glint — big and bright, the jet's most visible cue
    ctx.fillStyle = '#cfeeff';
    ctx.beginPath();
    ctx.ellipse(0, -34 * scale, 7.5 * scale, 14 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(-2 * scale, -38 * scale, 2.6 * scale, 7 * scale, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // wingtip strobes (blink with time)
    if (Math.sin(t * 6) > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-86 * scale, 26 * scale, 3 * scale, 0, Math.PI * 2);
      ctx.arc(86 * scale, 26 * scale, 3 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // livery stripe + roundel
    ctx.fillStyle = '#ff7a3c';
    ctx.fillRect(-13 * scale, -6 * scale, 26 * scale, 3 * scale);
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(0, 8 * scale, 4.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c94f5e';
    ctx.beginPath();
    ctx.arc(0, 8 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  speedLines(speed01) {
    if (speed01 < 0.45) return;
    const ctx = this.ctx;
    const n = Math.floor((speed01 - 0.4) * 26);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const edge = Math.random() < 0.5 ? 0 : 1;
      const x = edge === 0 ? Math.random() * this.W * 0.12 : this.W - Math.random() * this.W * 0.12;
      const y = Math.random() * this.H;
      const len = 20 + Math.random() * 60 * speed01;
      const dx = (x - this.cx) * 0.12;
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + len);
    }
    ctx.stroke();
  }

  vignette() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.cx, this.H * 0.55, this.H * 0.42,
      this.cx, this.H * 0.55, this.H * 0.95,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  fog(pal, depth01) {
    if (pal.fog <= 0) return;
    const ctx = this.ctx;
    const a = pal.fog * depth01;
    const g = ctx.createLinearGradient(0, this.horizon - 40, 0, this.H);
    g.addColorStop(0, `rgba(200,205,220,0)`);
    g.addColorStop(1, `rgba(200,205,220,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, this.horizon - 40, this.W, this.H - this.horizon + 40);
  }
}
