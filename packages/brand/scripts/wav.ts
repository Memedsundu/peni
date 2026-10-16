/**
 * The new-order chime as a 16-bit PCM WAV, written sample by sample (§15 Sound):
 * 0.6 s, 44.1 kHz mono; a sine at 880 Hz for 120 ms then 1320 Hz for 180 ms; 10 ms attack,
 * 120 ms release; peak −6 dBFS. It is the same chime the web staff board plays with WebAudio
 * (one oscillator stepping 880 → 1320 Hz under one gain envelope), so both sound alike.
 *
 * The oscillator phase is carried across the frequency step, so the step is click-free.
 */

export const CHIME = {
  sampleRate: 44_100,
  durationS: 0.6,
  tones: [
    { hz: 880, durationS: 0.12 },
    { hz: 1320, durationS: 0.18 },
  ],
  attackS: 0.01,
  releaseS: 0.12,
  peakDbfs: -6,
} as const;

/** Envelope gain (0…1) at time t: linear attack, hold, raised-cosine release, then silence. */
export function chimeEnvelope(t: number): number {
  const sound = CHIME.tones.reduce((s, tone) => s + tone.durationS, 0);
  if (t < 0) return 0;
  if (t < CHIME.attackS) return t / CHIME.attackS;
  if (t < sound) return 1;
  const r = (t - sound) / CHIME.releaseS;
  return r >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * r));
}

function frequencyAt(t: number): number {
  let edge = 0;
  for (const tone of CHIME.tones) {
    edge += tone.durationS;
    if (t < edge) return tone.hz;
  }
  return CHIME.tones[CHIME.tones.length - 1]!.hz; // the release rings on the last tone
}

/** Float samples in −1…1. */
export function chimeSamples(): Float64Array {
  const { sampleRate, durationS, peakDbfs } = CHIME;
  const count = Math.round(sampleRate * durationS);
  const peak = 10 ** (peakDbfs / 20);
  const out = new Float64Array(count);
  let phase = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    out[i] = Math.sin(phase) * chimeEnvelope(t) * peak;
    phase += (2 * Math.PI * frequencyAt(t)) / sampleRate;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
  }
  return out;
}

/** RIFF/WAVE, PCM format 1, mono, 16-bit little-endian. */
export function encodeWav16(samples: Float64Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

export function chimeWav(): Buffer {
  return encodeWav16(chimeSamples(), CHIME.sampleRate);
}
