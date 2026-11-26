// audio.js — every sound is synthesised with WebAudio, no files. One clear
// job: give the Kestrel a voice (engine drone, wind rush, ring chimes,
// landing applause, crash thud) that follows the flight model, and stay
// silent until the pilot first interacts, as browsers require.

export function createAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windSource: null,
    windGain: null,
    windFilter: null,
    muted: false,
    started: false,
  };
}

// Browsers only let audio start after a user gesture; call this from the
// first click or keypress. Safe to call repeatedly: it starts once.
export function ensureAudio(audio) {
  if (audio.started) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(ctx.destination);

    // Engine: two detuned sawtooth oscillators through a lowpass filter.
    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 68;
    audio.engineOsc2 = ctx.createOscillator();
    audio.engineOsc2.type = 'sawtooth';
    audio.engineOsc2.frequency.value = 68 * 1.5;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0.0;
    audio.engineOsc.connect(engineFilter);
    audio.engineOsc2.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.engineOsc2.start();

    // Wind: looped filtered noise whose level follows airspeed.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    audio.windSource = ctx.createBufferSource();
    audio.windSource.buffer = buffer;
    audio.windSource.loop = true;
    audio.windFilter = ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.frequency.value = 700;
    audio.windFilter.Q.value = 0.6;
    audio.windGain = ctx.createGain();
    audio.windGain.gain.value = 0.0;
    audio.windSource.connect(audio.windFilter);
    audio.windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    audio.windSource.start();

    audio.started = true;
  } catch {
    // No audio device, or the browser said no: fly silent.
    audio.started = false;
  }
}

// Called every frame while flying: engine pitch follows throttle, wind
// follows airspeed, and both fade when the engine is out.
export function updateFlightAudio(audio, ac) {
  if (!audio.started || audio.muted) return;
  const t = audio.ctx.currentTime;
  const rpm = 52 + ac.throttle * 66 + (ac.speedKt / 200) * 18;
  audio.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
  audio.engineOsc2.frequency.setTargetAtTime(rpm * 1.5, t, 0.08);
  const engineLevel = ac.engineOut ? 0 : 0.05 + ac.throttle * 0.075;
  audio.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
  const windLevel = Math.min(0.16, Math.max(0, (ac.speedKt - 40) / 900));
  audio.windGain.gain.setTargetAtTime(windLevel, t, 0.15);
  audio.windFilter.frequency.setTargetAtTime(500 + ac.speedKt * 4, t, 0.2);
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.started && audio.master) {
    audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
  }
}

// --- One-shot effects ------------------------------------------------------
// A short helper: one oscillator, one envelope, done.
function blip(audio, freq, dur, type, level, slideTo) {
  if (!audio.started || audio.muted) return;
  try {
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    // Audio died mid-flight: ignore it and keep flying.
  }
}

// Two-note chime when the Kestrel threads a ring.
export function playRingChime(audio) {
  blip(audio, 880, 0.16, 'sine', 0.22);
  setTimeout(() => blip(audio, 1318, 0.24, 'sine', 0.2), 90);
}

// Bright tick when a slalom gate counts.
export function playGateTick(audio) {
  blip(audio, 1174, 0.12, 'triangle', 0.22, 1568);
}

// Low warning buzz when a gate is flown too high to count.
export function playTooHighBuzz(audio) {
  blip(audio, 220, 0.3, 'square', 0.12, 160);
}

// Warm three-note arpeggio for a mission completed.
export function playSuccessFanfare(audio) {
  [523, 659, 784].forEach((f, i) => {
    setTimeout(() => blip(audio, f, 0.4, 'sine', 0.22), i * 130);
  });
}

// A soft thud plus a descending tone for a crash.
export function playCrashThud(audio) {
  if (!audio.started || audio.muted) return;
  try {
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + 0.6);
  } catch {
    // Silent is fine.
  }
}

// Gentle two-note touchdown confirmation.
export function playLandingChime(audio) {
  blip(audio, 659, 0.3, 'sine', 0.2);
  setTimeout(() => blip(audio, 988, 0.45, 'sine', 0.18), 140);
}

// A soft click for menu picks.
export function playClick(audio) {
  blip(audio, 660, 0.07, 'triangle', 0.14);
}

// Stall warble: a rising-falling tone while the wing is stalled.
// Called from the game loop; it only sounds while stalled is true.
let lastStallWarble = 0;
export function playStallWarble(audio, stalled) {
  if (!stalled) return;
  const now = performance.now();
  if (now - lastStallWarble < 420) return;
  lastStallWarble = now;
  blip(audio, 440, 0.18, 'square', 0.07, 620);
}


