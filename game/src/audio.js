// WebAudio synth — no audio files, everything is generated: engine drone,
// wind rush, ring chimes, explosions, UI clicks. Starts on first gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.windSrc = null;
    this.windGain = null;
    this.windFilter = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return false;
    }
    // --- engine: two detuned saws through a lowpass ---
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55.7;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp);
    osc2.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
    this.engineFilter = lp;

    // --- wind: looped noise buffer through a bandpass ---
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = buf;
    this.windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    this.windSrc.start();
    return true;
  }

  // Called every frame with the plane's state.
  update(throttle, speed01, flying) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = this.muted || !flying ? 0 : 0.05 + throttle * 0.075;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    const freq = 52 + throttle * 68 + speed01 * 30;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.012, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
    const wind = this.muted || !flying ? 0 : speed01 * speed01 * 0.16;
    this.windGain.gain.setTargetAtTime(wind, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + speed01 * 1400, t, 0.15);
  }

  blip(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  ring() {
    this.blip(880, 0.35, 'sine', 0.2);
    this.blip(1318, 0.4, 'sine', 0.14, 0.06);
    this.blip(1760, 0.5, 'sine', 0.08, 0.12);
  }

  drop() {
    this.blip(520, 0.25, 'triangle', 0.18);
    this.blip(392, 0.35, 'triangle', 0.14, 0.09);
  }

  thud() {
    this.blip(90, 0.3, 'sine', 0.3);
    this.noiseBurst(0.25, 0.22);
  }

  explosion() {
    this.noiseBurst(0.9, 0.4);
    this.blip(55, 0.8, 'sine', 0.35);
  }

  noiseBurst(dur, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.ctx.destination);
    src.start(t);
  }

  click() {
    this.blip(660, 0.08, 'square', 0.06);
  }

  fanfare(medal) {
    const notes = medal === 'gold'
      ? [523, 659, 784, 1047]
      : medal === 'silver'
        ? [523, 659, 784]
        : [523, 659];
    notes.forEach((f, i) => this.blip(f, 0.5, 'triangle', 0.16, i * 0.13));
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}
