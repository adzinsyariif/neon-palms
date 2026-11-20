// NEON PALMS — procedural WebAudio: no audio files, everything is
// synthesised. Engine hum tied to speed, two-tone police sirens, pickup
// and mission blips, impact thuds, and a soft synth pad on the menu.
// Audio starts on the first user gesture (browser autoplay rules).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.padNodes = [];
    this.sirenOn = false;
  }

  start() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return; // no audio available: the game still runs silently
    }
    this.started = true;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: sawtooth through a lowpass, gain follows throttle.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineFilter = engineFilter;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // Siren: square wave whose frequency alternates (handled in update).
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  startPad() {
    if (!this.started || this.padNodes.length) return;
    const ctx = this.ctx;
    // A slow warm pad: three detuned triangles on a sunset chord (Fmaj9-ish).
    const freqs = [174.61, 220.0, 261.63, 329.63];
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(gain).connect(this.master);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
      o.connect(filter);
      o.start();
      this.padNodes.push(o);
    }
    this.padGain = gain;
  }

  stopPad() {
    if (!this.padNodes.length) return;
    const t = this.ctx.currentTime;
    this.padGain.gain.cancelScheduledValues(t);
    this.padGain.gain.setValueAtTime(this.padGain.gain.value, t);
    this.padGain.gain.linearRampToValueAtTime(0, t + 0.8);
    const nodes = this.padNodes;
    setTimeout(() => nodes.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } }), 900);
    this.padNodes = [];
  }

  blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.16, when = 0) {
    if (!this.started) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t0 = ctx.currentTime + when;
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  pickup() { this.blip(920, 0.1, 'sine', 0.18); this.blip(1380, 0.14, 'sine', 0.16, 0.07); }
  missionStart() { this.blip(523, 0.12, 'triangle', 0.2); this.blip(784, 0.16, 'triangle', 0.2, 0.1); }
  missionComplete() {
    this.blip(659, 0.12, 'triangle', 0.2);
    this.blip(880, 0.12, 'triangle', 0.2, 0.1);
    this.blip(1174, 0.22, 'triangle', 0.22, 0.2);
  }
  fail() { this.blip(330, 0.2, 'sawtooth', 0.14); this.blip(220, 0.3, 'sawtooth', 0.14, 0.14); }
  door() { this.blip(190, 0.09, 'square', 0.1); this.blip(140, 0.1, 'square', 0.1, 0.08); }
  thud(strength = 1) {
    if (!this.started) return;
    const ctx = this.ctx;
    const dur = 0.16;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0.25 * Math.min(1, strength);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  // Called every frame with live game state.
  update(dt, { inCar, speedRatio, sirensNear, time }) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // Engine pitch/gain.
    const targetGain = inCar ? 0.05 + Math.abs(speedRatio) * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + Math.abs(speedRatio) * 130, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(360 + Math.abs(speedRatio) * 900, t, 0.1);
    // Sirens: audible when police are active and near.
    const sirenTarget = sirensNear > 0 ? Math.max(0.008, 0.05 - sirensNear * 0.0004) : 0;
    this.sirenGain.gain.setTargetAtTime(sirenTarget, t, 0.2);
    if (sirensNear > 0) {
      const twoTone = Math.sin(time * 4.4) > 0 ? 950 : 720;
      this.sirenOsc.frequency.setTargetAtTime(twoTone, t, 0.03);
    }
    void dt;
  }
}
