import { concatInt16, encodeWav, resampleInt16, toMono } from '../wav';

describe('encodeWav', () => {
  it('writes a mono 16-bit PCM header Meta accepts', () => {
    const wav = encodeWav(new Int16Array([1, -2, 3]), 16000);
    const view = new DataView(wav.buffer);
    const ascii = (o: number, n: number) => String.fromCharCode(...Array.from(wav.slice(o, o + n)));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16); // 16-bit
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(wav.length).toBe(44 + 6);
    expect(view.getInt16(44, true)).toBe(1);
    expect(view.getInt16(46, true)).toBe(-2);
    expect(view.getInt16(48, true)).toBe(3);
  });

  it('handles silence of zero length', () => {
    expect(encodeWav(new Int16Array(0), 16000)).toHaveLength(44);
  });
});

describe('audio helpers', () => {
  it('joins chunks in order', () => {
    expect(Array.from(concatInt16([new Int16Array([1, 2]), new Int16Array([3])]))).toEqual([
      1, 2, 3,
    ]);
  });

  it('resamples to the rate Meta expects', () => {
    const down = resampleInt16(new Int16Array([0, 100, 200, 300, 400, 500]), 48000, 16000);
    expect(Array.from(down)).toEqual([0, 300]);
    const same = new Int16Array([5, 6]);
    expect(resampleInt16(same, 16000, 16000)).toBe(same);
  });

  it('mixes stereo down to mono', () => {
    expect(Array.from(toMono(new Int16Array([100, 200, -100, -300]), 2))).toEqual([150, -200]);
  });
});
