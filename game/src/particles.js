// Particles — contrails, ring bursts, explosions, rain, embers.
// Pure data + update; the renderer draws them. No DOM here.
export class Particles {
  constructor() {
    this.list = [];
  }

  spawn(p) {
    if (this.list.length > 900) this.list.splice(0, this.list.length - 900);
    this.list.push({
      x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0,
      life: p.life || 1, maxLife: p.life || 1,
      size: p.size || 3, color: p.color || '#fff',
      drag: p.drag ?? 0.98, grow: p.grow || 0, gravity: p.gravity || 0,
      shape: p.shape || 'dot',
    });
  }

  burst(x, y, n, color, speed = 160, life = 0.8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.spawn({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.6),
        size: 2 + Math.random() * 4, color,
        drag: 0.94, grow: -0.5,
      });
    }
  }

  ringBurst(x, y, color = '#ffd76a') {
    // a gold shockwave ring + sparks
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.5, size: 8, color, shape: 'ring', grow: 260 });
    this.burst(x, y, 26, color, 220, 0.9);
    this.burst(x, y, 12, '#ffffff', 120, 0.6);
  }

  explosion(x, y) {
    this.burst(x, y, 40, '#ff7a3c', 260, 1.1);
    this.burst(x, y, 24, '#ffc46a', 170, 0.9);
    this.burst(x, y, 18, '#3a3a44', 90, 1.6);
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.7, size: 10, color: '#fff2c0', shape: 'ring', grow: 420 });
  }

  contrail(x, y, vx, vy, color = 'rgba(255,255,255,0.55)') {
    this.spawn({ x, y, vx: vx * 0.2, vy: vy * 0.2, life: 0.9, size: 3.5, color, drag: 0.99, grow: 6 });
  }

  ember(x, y) {
    this.spawn({
      x, y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 40,
      life: 1.4, size: 2 + Math.random() * 2, color: '#ffb35e', drag: 0.995,
    });
  }

  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.size = Math.max(0.5, p.size + p.grow * dt);
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.list) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      if (p.shape === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.list = [];
  }
}
