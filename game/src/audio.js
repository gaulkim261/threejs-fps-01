export function createAudio() {
  let context = null, master = null, noiseBuffer = null, foot = 0;

  // Only a user gesture creates/resumes audio. Noise never consumes state.rng.
  function unlock() {
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0.38;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 12;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.12;
        master.connect(limiter);
        limiter.connect(context.destination);
        noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        let seed = 0x53435241;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[i] = seed / 2147483648 - 1;
        }
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Audio is optional, including in headless browsers. */ }
  }
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  function ready() { return context && master && context.state === 'running'; }
  function envelope(gain, at, duration, volume) {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  }
  function tone(hz, duration, volume, type = 'sine', delay = 0, endHz = hz) {
    if (!ready()) return;
    const at = context.currentTime + delay;
    const source = context.createOscillator(), gain = context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(hz, at);
    source.frequency.exponentialRampToValueAtTime(endHz, at + duration);
    envelope(gain, at, duration, volume);
    source.connect(gain);
    gain.connect(master);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(at);
    source.stop(at + duration + 0.015);
  }
  function noise(duration, volume, cutoff, delay = 0) {
    if (!ready() || !noiseBuffer) return;
    const at = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, at);
    envelope(gain, at, duration, volume);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect();
    };
    source.start(at);
    source.stop(at + duration + 0.015);
  }

  return {
    shoot(kind) {
      if (!ready()) return;
      switch (String(kind).toLowerCase()) {
        case 'longshot':
          noise(0.19, 0.85, 5500);
          tone(155, 0.16, 0.65, 'triangle', 0, 42); break;
        case 'rasp':
          noise(0.075, 0.48, 7800);
          tone(190, 0.065, 0.28, 'square', 0, 85); break;
        case 'frag':
          noise(0.65, 0.95, 1200);
          tone(90, 0.55, 0.7, 'sine', 0, 25); break;
        default:
          noise(0.11, 0.58, 4200);
          tone(210, 0.09, 0.4, 'triangle', 0, 70);
      }
    },
    hit() { tone(1150, 0.045, 0.18, 'triangle'); },
    kill() {
      tone(740, 0.09, 0.26, 'triangle');
      tone(1480, 0.14, 0.23, 'sine', 0.075);
    },
    reload() {
      noise(0.065, 0.2, 2600);
      noise(0.07, 0.24, 4000, 0.24);
      tone(260, 0.045, 0.12, 'square', 0.38, 180);
    },
    step() {
      if (!ready()) return;
      noise(0.075, 0.13, ++foot % 2 ? 700 : 950);
      tone(78, 0.055, 0.09, 'sine', 0, 45);
    },
    plant() {
      tone(620, 0.1, 0.18, 'square');
      tone(930, 0.13, 0.16, 'sine', 0.13);
    },
    defuse() {
      tone(930, 0.12, 0.18, 'sine');
      tone(465, 0.18, 0.16, 'triangle', 0.13);
    },
    beep(urgency = 0) {
      const u = Number.isFinite(urgency) ? Math.max(0, Math.min(1, urgency)) : 0;
      tone(880 + u * 640, 0.12 - u * 0.055, 0.16 + u * 0.08, 'square');
    },
    roundWin() {
      tone(440, 0.22, 0.22, 'triangle');
      tone(554.37, 0.22, 0.22, 'triangle', 0.16);
      tone(659.25, 0.4, 0.24, 'triangle', 0.32);
    },
    roundLose() {
      tone(330, 0.24, 0.22, 'triangle');
      tone(277.18, 0.24, 0.2, 'triangle', 0.18);
      tone(220, 0.42, 0.22, 'triangle', 0.36);
    },
    buy() { tone(980, 0.075, 0.16); tone(1320, 0.09, 0.14, 'sine', 0.07); },
    denied() { tone(145, 0.16, 0.15, 'sawtooth', 0, 110); },
  };
}
