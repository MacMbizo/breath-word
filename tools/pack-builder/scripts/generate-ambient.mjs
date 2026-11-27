// FR-106 ambient beds — deterministic, licence-free synthesis of the three looping tracks
// (`rain`, `piano`, `pad`) the Ambient Mixer plays under narration.
//
//   node tools/pack-builder/scripts/generate-ambient.mjs
//
// Writes 16-bit mono WAV loops to `apps/desktop/public/audio/ambient/` and
// `apps/mobile/assets/audio/ambient/`. Every voice is mixed *circularly* (sample i lands at
// i mod N), so a decaying piano note or filter tail that runs past the end wraps to the start and
// the loop has no seam. A seeded PRNG keeps the output byte-identical between runs.
// Budget (B7): ~3 MB for all ambient loops bundled in a binary.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 22_050;
const LOOP_SECONDS = 20;
const N = SAMPLE_RATE * LOOP_SECONDS;
const TAU = Math.PI * 2;

/** mulberry32 — small seeded PRNG so every build produces identical files. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Frequencies snapped so a whole number of cycles fits the loop (no phase jump at the seam). */
const loopFreq = (hz) => Math.round(hz * LOOP_SECONDS) / LOOP_SECONDS;

/** One-pole low-pass run twice around the ring so its state at the seam matches the start. */
function circularLowpass(input, cutoffHz) {
  const alpha = 1 - Math.exp((-TAU * cutoffHz) / SAMPLE_RATE);
  const out = new Float64Array(N);
  let y = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < N; i += 1) {
      y += alpha * (input[i] - y);
      out[i] = y;
    }
  }
  return out;
}

function rain() {
  const random = prng(0x5eed_01);
  const white = Float64Array.from({ length: N }, () => random() * 2 - 1);
  // Body of the rain: soft broadband hiss with the harsh top rolled off.
  const hiss = circularLowpass(white, 3_200);
  const rumble = circularLowpass(white, 400);
  const out = new Float64Array(N);
  for (let i = 0; i < N; i += 1) out[i] = hiss[i] * 0.55 + rumble[i] * 0.9;
  // Droplets: short decaying high-passed ticks scattered through the loop.
  for (let d = 0; d < 900; d += 1) {
    const start = Math.floor(random() * N);
    const gain = 0.04 + random() * 0.1;
    const decay = 0.0008 + random() * 0.002;
    const pitch = 2_000 + random() * 3_000;
    const length = Math.floor(SAMPLE_RATE * 0.03);
    for (let k = 0; k < length; k += 1) {
      const t = k / SAMPLE_RATE;
      out[(start + k) % N] += gain * Math.exp(-t / decay) * Math.sin(TAU * pitch * t);
    }
  }
  // Slow swell so the bed breathes (two cycles per loop).
  for (let i = 0; i < N; i += 1) out[i] *= 0.85 + 0.15 * Math.sin((TAU * 2 * i) / N);
  return out;
}

function pianoNote(out, startSample, hz, velocity) {
  const length = SAMPLE_RATE * 7;
  const partials = [1, 2, 3, 4, 5];
  const weights = [1, 0.42, 0.2, 0.1, 0.05];
  for (let k = 0; k < length; k += 1) {
    const t = k / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.006);
    let sample = 0;
    partials.forEach((p, idx) => {
      // Higher partials decay faster, and a touch of inharmonicity keeps it from sounding like an organ.
      const f = hz * p * (1 + 0.0004 * p * p);
      sample += weights[idx] * Math.exp(-t * (0.9 + p * 0.55)) * Math.sin(TAU * f * t);
    });
    out[(startSample + k) % N] += velocity * attack * sample;
  }
}

function piano() {
  const random = prng(0x5eed_02);
  // C major pentatonic across two octaves — no note clashes with any other.
  const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
  const out = new Float64Array(N);
  const beat = SAMPLE_RATE * 1.25; // a gentle 48 bpm pulse, 16 beats per loop
  for (let b = 0; b < 16; b += 1) {
    if (random() < 0.3) continue; // leave space between phrases
    const note = scale[Math.floor(random() * scale.length)];
    const offset = Math.floor((random() - 0.5) * SAMPLE_RATE * 0.08); // humanised timing
    pianoNote(out, Math.floor(b * beat) + offset + N, note, 0.22 + random() * 0.12);
    if (random() < 0.35) pianoNote(out, Math.floor(b * beat) + N, note / 2, 0.14);
  }
  return circularLowpass(out, 5_000);
}

function pad() {
  // Cmaj9 voicing; each note is a detuned pair whose beating period divides the loop.
  const chord = [130.81, 196.0, 246.94, 293.66, 329.63].map(loopFreq);
  const detune = 0.1; // Hz — beats every 10 s, two per loop
  const out = new Float64Array(N);
  for (let i = 0; i < N; i += 1) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    chord.forEach((f, idx) => {
      const level = 1 / (idx + 1.5);
      sample += level * (Math.sin(TAU * f * t) + Math.sin(TAU * (f + detune) * t + idx));
      sample += level * 0.25 * Math.sin(TAU * f * 2 * t + idx * 0.7);
    });
    const swell = 0.75 + 0.25 * Math.sin((TAU * i) / N); // one slow swell per loop
    out[i] = sample * swell;
  }
  return circularLowpass(out, 1_800);
}

/** Normalize to -6 dBFS and encode as 16-bit PCM mono WAV. */
function toWav(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 0 ? 0.5 / peak : 0;
  const data = Buffer.alloc(N * 2);
  for (let i = 0; i < N; i += 1) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * scale * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const targets = [join(root, 'apps/desktop/public/audio/ambient'), join(root, 'apps/mobile/assets/audio/ambient')];
const tracks = { rain: rain(), piano: piano(), pad: pad() };

for (const dir of targets) {
  mkdirSync(dir, { recursive: true });
  for (const [name, samples] of Object.entries(tracks)) {
    const wav = toWav(samples);
    writeFileSync(join(dir, `${name}.wav`), wav);
    process.stdout.write(`generate-ambient: ${join(dir, `${name}.wav`)} (${wav.length} bytes)\n`);
  }
}
