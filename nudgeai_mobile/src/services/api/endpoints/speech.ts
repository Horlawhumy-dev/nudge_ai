import { api } from '../client';

export type Transcript = { text: string; model: string; language: string | null };

export const speechApi = {
  /**
   * Turn a short voice note into text. `wav` is mono 16-bit PCM WAV; the server forwards it to
   * Meta's speech model and keeps nothing.
   */
  async transcribe(wav: Uint8Array) {
    const body = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
    const { data } = await api.post<Transcript>('/speech/transcribe', body, {
      headers: { 'Content-Type': 'audio/wav' },
      timeout: 60_000,
      transformRequest: [(d: unknown) => d],
    });
    return data;
  },

  /**
   * Spoken audio (MP3) for a short piece of text, from the backend's voice service.
   * Rejects with an ApiError; 503 means spoken output isn't set up on the server.
   */
  async synthesize(text: string) {
    const { data } = await api.post<ArrayBuffer>(
      '/speech/synthesize',
      { text },
      { responseType: 'arraybuffer', timeout: 30_000 }
    );
    return new Uint8Array(data);
  },
};
