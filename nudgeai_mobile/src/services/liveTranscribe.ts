import { API_URL, DEMO_MODE } from '@/constants/env';

import { refreshSession } from './api/client';
import { getTokens } from './api/tokens';

export type LiveCallbacks = {
  /** The words so far; each call replaces the last. */
  onPartial: (text: string) => void;
  /** Speech started (true) or paused (false), as heard by the model. */
  onSpeech?: (active: boolean) => void;
  /** The finished sentence. */
  onTurn: (text: string) => void;
  /** Live transcription can't be used; the caller falls back to uploading the recording. */
  onFail: (code: string) => void;
};

export type LiveTranscription = {
  /** 16 kHz mono 16-bit samples, in real time. Safe to call before the connection is ready. */
  sendAudio: (pcm: Int16Array) => void;
  /** The person ended the recording; the finished sentence follows. */
  stop: () => void;
  /** Hang up (also safe after a failure). */
  close: () => void;
};

/** How long to wait for the server to say it is ready before giving up on live. */
export const READY_TIMEOUT_MS = 8_000;
/** Audio waiting for the connection is capped at about this many seconds (oldest dropped). */
const MAX_PENDING_SECONDS = 10;
const SAMPLE_RATE = 16_000;

/** `https://host/api/v1` -> `wss://host/api/v1/speech/live`. */
export function liveUrl(apiUrl: string = API_URL): string {
  return `${apiUrl.replace(/^http/, 'ws').replace(/\/+$/, '')}/speech/live`;
}

function toBuffer(pcm: Int16Array): ArrayBuffer {
  return pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
}

/**
 * Stream the microphone to the backend, which relays it to Meta's realtime speech model, and get
 * the words back as they are spoken. Returns null when live isn't possible at all (demo mode).
 */
export function openLiveTranscription(callbacks: LiveCallbacks): LiveTranscription | null {
  if (DEMO_MODE || !API_URL) return null;

  let socket: WebSocket | null = null;
  let ready = false;
  let failed = false;
  let closedByUs = false;
  let wantsStop = false;
  let turnDelivered = false;
  let pending: Int16Array[] = [];
  let pendingSamples = 0;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;

  const fail = (code: string) => {
    if (failed || closedByUs) return;
    failed = true;
    clearTimeout(readyTimer);
    pending = [];
    try {
      socket?.close();
    } catch {
      // already closed
    }
    callbacks.onFail(code);
  };

  const flush = () => {
    for (const chunk of pending) socket?.send(toBuffer(chunk));
    pending = [];
    pendingSamples = 0;
    if (wantsStop) socket?.send(JSON.stringify({ type: 'stop' }));
  };

  const connect = async (retried: boolean): Promise<void> => {
    const token = (await getTokens())?.accessToken;
    if (closedByUs) return;
    if (!token) return fail('unauthorized');

    const ws = new WebSocket(liveUrl());
    ws.binaryType = 'arraybuffer';
    socket = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'start', token, mode: 'ENDPOINTING' }));
    ws.onmessage = (event: { data: unknown }) => {
      if (typeof event.data !== 'string') return;
      let message: { type?: string; text?: string; active?: boolean; code?: string };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case 'ready':
          ready = true;
          clearTimeout(readyTimer);
          flush();
          break;
        case 'partial':
          callbacks.onPartial(message.text ?? '');
          break;
        case 'speech':
          callbacks.onSpeech?.(Boolean(message.active));
          break;
        case 'turn':
          turnDelivered = true;
          callbacks.onTurn(message.text ?? '');
          break;
        case 'error':
          // An expired access token is the one failure worth a quiet retry.
          if (message.code === 'unauthorized' && !retried) {
            ws.onclose = null;
            ws.close();
            void refreshSession().then((fresh) => (fresh ? connect(true) : fail('unauthorized')));
          } else {
            fail(message.code ?? 'error');
          }
          break;
      }
    };
    ws.onerror = () => fail('network');
    ws.onclose = () => {
      // Closing after the sentence was delivered is normal; closing before it is a failure.
      if (!turnDelivered) fail('closed');
    };
  };

  readyTimer = setTimeout(() => fail('timeout'), READY_TIMEOUT_MS);
  void connect(false);

  return {
    sendAudio: (pcm) => {
      if (failed || closedByUs) return;
      if (ready && socket?.readyState === 1) {
        socket.send(toBuffer(pcm));
        return;
      }
      pending.push(pcm);
      pendingSamples += pcm.length;
      while (pendingSamples > MAX_PENDING_SECONDS * SAMPLE_RATE && pending.length > 1) {
        pendingSamples -= pending.shift()?.length ?? 0;
      }
    },
    stop: () => {
      if (failed || closedByUs) return;
      wantsStop = true;
      if (ready && socket?.readyState === 1) socket.send(JSON.stringify({ type: 'stop' }));
    },
    close: () => {
      closedByUs = true;
      clearTimeout(readyTimer);
      pending = [];
      try {
        socket?.close();
      } catch {
        // already closed
      }
    },
  };
}
