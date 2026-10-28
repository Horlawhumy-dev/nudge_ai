/**
 * Build a WAV file from raw PCM in memory. Meta's speech model takes mono 16-bit WAV at 16 or
 * 24 kHz, and a phone's microphone stream is exactly that once wrapped in a 44-byte header, so
 * no audio file is ever written to disk.
 */

const HEADER_BYTES = 44;
export const SPEECH_SAMPLE_RATE = 16_000;

export function concatInt16(chunks: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Linear-interpolation resample, for when the hardware didn't give us the rate we asked for. */
export function resampleInt16(samples: Int16Array, from: number, to: number): Int16Array {
  if (from === to || samples.length === 0) return samples;
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const out = new Int16Array(length);
  const step = from / to;
  for (let i = 0; i < length; i += 1) {
    const pos = i * step;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = pos - lo;
    out[i] = Math.round(
      samples[Math.min(lo, samples.length - 1)] * (1 - frac) + samples[hi] * frac
    );
  }
  return out;
}

/** Average interleaved stereo (or more) down to mono. */
export function toMono(samples: Int16Array, channels: number): Int16Array {
  if (channels <= 1) return samples;
  const frames = Math.floor(samples.length / channels);
  const out = new Int16Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) sum += samples[f * channels + c];
    out[f] = Math.round(sum / channels);
  }
  return out;
}

export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));

  text(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  new Int16Array(buffer, HEADER_BYTES, samples.length).set(samples);
  return new Uint8Array(buffer);
}
