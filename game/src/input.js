// Keyboard + mouse input. Arrow keys / WASD fly, Shift throttle up,
// Ctrl/Cmd throttle down, Space drops a crate, G toggles autopilot assist,
// C toggles cockpit view, M mutes, P pauses. Mouse: hold left button and
// drag to steer.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { down: false, dx: 0, dy: 0 };
    this.dropPressed = false;
    this.pressed = new Set(); // edge-triggered keys, consumed by the game
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.key.toLowerCase());
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.dx = 0;
      this.mouse.dy = 0;
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.mouse.down) return;
      const r = canvas.getBoundingClientRect();
      this.mouse.dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      this.mouse.dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
  }

  // Edge-triggered: true once per physical press.
  wasPressed(key) {
    key = key.toLowerCase();
    if (this.pressed.has(key)) {
      this.pressed.delete(key);
      return true;
    }
    return false;
  }

  // Continuous flight input. Returns { steer, pitch, throttleDelta, drop }.
  flight(throttle) {
    let steer = 0;
    let pitch = 0;
    if (this.keys.has('arrowleft')) steer -= 1;
    if (this.keys.has('arrowright')) steer += 1;
    if (this.keys.has('arrowup')) pitch += 1;
    if (this.keys.has('arrowdown')) pitch -= 1;
    // WASD as an alternative stick (A/D steer, W/S pitch)
    if (this.keys.has('a')) steer -= 1;
    if (this.keys.has('d')) steer += 1;
    if (this.keys.has('w')) pitch += 1;
    if (this.keys.has('s')) pitch -= 1;
    if (this.mouse.down) {
      steer = Math.max(-1, Math.min(1, this.mouse.dx * 1.4));
      pitch = Math.max(-1, Math.min(1, -this.mouse.dy * 1.4));
    }
    let throttleDelta = 0;
    if (this.keys.has('shift')) throttleDelta += 0.55;
    if (this.keys.has('control') || this.keys.has('meta')) throttleDelta -= 0.55;
    const drop = this.wasPressed(' ');
    return { steer, pitch, throttleDelta, drop };
  }
}
