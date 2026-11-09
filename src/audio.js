// Chiptune-style sound effects made with the Web Audio API.

let audio = null;
let muted = false;

export function setMuted(value) {
  muted = value;
}

// iPhones only allow sound to start from a tap, so this runs on the first one.
export function unlockAudio() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) return;
  audio ??= new Context();
  if (audio.state === 'suspended') audio.resume();
}

function tone(freq, duration, { type = 'square', volume = 0.06, slide = 1, delay = 0 } = {}) {
  if (!audio || muted) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * slide, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function melody(notes, gap, options) {
  notes.forEach((freq, i) => tone(freq, gap * 1.6, { ...options, delay: i * gap }));
}

export const sfx = {
  tap: () => tone(660, 0.05),
  serve: () => tone(330, 0.1, { slide: 2 }),
  hit: (rally) => tone(240 + Math.min(rally, 20) * 12, 0.07, { type: 'triangle', volume: 0.16 }),
  front: () => tone(190, 0.05, { type: 'triangle', volume: 0.12 }),
  wall: () => tone(150, 0.03, { type: 'triangle', volume: 0.07 }),
  floor: () => tone(90, 0.04, { type: 'triangle', volume: 0.08 }),
  won: () => melody([659, 880], 0.08),
  lost: () => tone(300, 0.3, { type: 'sawtooth', slide: 0.3 }),
  star: (i) => tone(660 * 1.25 ** i, 0.16),
  clear: () => melody([523, 659, 784, 1047], 0.08),
  over: () => melody([392, 330, 262, 196], 0.14, { type: 'triangle', volume: 0.12 }),
  unlock: () => melody([784, 1047, 1319], 0.07),
  tieBreak: () => melody([523, 523, 784, 1047], 0.12),
};
