import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';

import { DEMO_MODE } from '@/constants/env';
import type { ToneId } from '@/features/onboarding/data';
import { deliveryFor, spokenText } from '@/features/settings/voice';
import { MAX_SPOKEN_CHARS, speakableText } from '@/lib/speakable';
import { SentenceBuffer } from '@/lib/sentences';

import { speechApi } from './api/endpoints/speech';

export type Speaking = { stop: () => void };
/** Speech that can be fed text as it arrives. */
export type SpeechSession = Speaking & {
  /** More of the reply. Sentences are spoken as soon as they are complete. */
  push: (piece: string) => void;
  /** Speak what has arrived so far even if its last sentence isn't finished (a lead-in like "Let me check."). */
  flush: () => void;
  /** No more text is coming; speak what is left. */
  end: () => void;
};

type Options = {
  tone?: ToneId;
  /** Called once when the voice stops for any reason: finished, stopped or failed. */
  onEnd?: () => void;
};

/** After the server voice fails, skip it for a while so each line doesn't wait on a dead service. */
const RETRY_AFTER_MS = 5 * 60_000;
let serverVoiceDownUntil = 0;
/** ElevenLabs' free plan allows two requests at once; asking for more gets some refused. */
const PARALLEL_REQUESTS = 2;
let fileCounter = 0;

/** The phone's own voice: instant and offline, used when the server voice isn't available. */
function speakOnDevice(text: string, tone: ToneId, onEnd?: () => void): Speaking {
  const { rate, pitch } = deliveryFor(tone);
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    onEnd?.();
  };
  Speech.speak(text, {
    language: 'en',
    rate,
    pitch,
    onDone: end,
    onStopped: end,
    onError: end,
  });
  return {
    stop: () => {
      void Speech.stop();
      end();
    },
  };
}

/** Play MP3 bytes from a temporary file, deleted as soon as playback ends. */
async function playBytes(bytes: Uint8Array, tone: ToneId, onEnd: () => void): Promise<Speaking> {
  fileCounter += 1;
  const file = new File(Paths.cache, `nudge-voice-${Date.now()}-${fileCounter}.mp3`);
  file.create({ overwrite: true });
  file.write(bytes);

  await setAudioModeAsync({ playsInSilentMode: true });
  const player = createAudioPlayer({ uri: file.uri });
  // `playbackRate` is read-only on the player; the speed is set with a method.
  const { rate } = deliveryFor(tone);
  if (rate !== 1) player.setPlaybackRate(rate, 'high');

  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    subscription.remove();
    try {
      player.remove();
    } catch {
      // already released
    }
    try {
      file.delete();
    } catch {
      // the system clears the cache folder anyway
    }
    onEnd();
  };
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) end();
  });
  player.play();
  return { stop: end };
}

type Item = { text: string; audio: Promise<Uint8Array> | null; requested: boolean };

/**
 * Speak a reply as it is written. Each sentence is sent for voicing the moment it is complete (two
 * at a time), and played back to back as the audio arrives, so the first sentence is heard while
 * the model is still writing the rest. Uses the ElevenLabs voice through the backend, sentence by
 * sentence falling back to the phone's own voice if that isn't set up or fails. `onEnd` fires once,
 * when speech finishes, is stopped, or there was nothing to say.
 */
export function startSpeech(options: Options = {}): SpeechSession {
  const tone = options.tone ?? 'mix';
  const buffer = new SentenceBuffer();
  const queue: Item[] = [];
  let remaining = MAX_SPOKEN_CHARS; // a spoken reply is the gist, not the whole essay
  let ended = false;
  let stopped = false;
  let finished = false;
  let running = false;
  let current: Speaking | null = null;
  let announced = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    options.onEnd?.();
  };

  // Requests still waiting for their audio, including the sentence about to be played.
  let inFlight = 0;
  const request = (item: Item) => {
    item.requested = true;
    if (DEMO_MODE || Date.now() < serverVoiceDownUntil) return; // the phone's voice for this one
    const audio = speechApi.synthesize(item.text);
    item.audio = audio;
    inFlight += 1;
    const settled = () => {
      inFlight -= 1;
      prefetch(); // a slot is free: start voicing the next sentence
    };
    audio.then(settled, settled); // also marks a failure as handled; it is awaited where it plays
  };
  const prefetch = () => {
    for (const item of queue) {
      if (inFlight >= PARALLEL_REQUESTS) return;
      if (!item.requested) request(item);
    }
  };

  const playBytesOnce = (bytes: Uint8Array) =>
    new Promise<void>((resolve, reject) => {
      playBytes(bytes, tone, resolve).then((handle) => {
        current = handle;
        if (stopped) handle.stop();
      }, reject);
    });
  const speakOnDeviceOnce = (text: string) =>
    new Promise<void>((resolve) => {
      if (stopped) return resolve();
      current = speakOnDevice(text, tone, resolve);
    });

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      while (!stopped && queue.length > 0) {
        const item = queue.shift() as Item;
        prefetch(); // keep the next sentences coming while this one plays
        if (item.audio) {
          try {
            const bytes = await item.audio;
            if (stopped) break;
            await playBytesOnce(bytes);
            if (__DEV__ && !announced) console.log('[nudge] speaking with the ElevenLabs voice');
            announced = true;
          } catch (e) {
            serverVoiceDownUntil = Date.now() + RETRY_AFTER_MS;
            if (__DEV__)
              console.log(`[nudge] ElevenLabs voice unavailable, using the phone's: ${String(e)}`);
            await speakOnDeviceOnce(item.text);
          }
        } else {
          if (__DEV__ && !announced) console.log('[nudge] speaking with the phone voice');
          announced = true;
          await speakOnDeviceOnce(item.text);
        }
      }
    } finally {
      running = false;
    }
    if (stopped) return;
    if (queue.length > 0) return run(); // something arrived while the last line was finishing
    if (ended) finish();
  };

  const enqueue = (markdown: string) => {
    if (stopped || remaining <= 0) return;
    const text = spokenText(speakableText(markdown, remaining));
    if (!text) return;
    // Once a sentence had to be cut to fit, nothing after it would make sense: stop there.
    remaining = text.length < markdown.trim().length ? 0 : remaining - text.length;
    queue.push({ text, audio: null, requested: false });
    prefetch();
    void run();
  };

  return {
    push: (piece) => {
      if (stopped || ended) return;
      buffer.push(piece).forEach(enqueue);
    },
    flush: () => {
      if (stopped || ended) return;
      const rest = buffer.flush();
      if (rest) enqueue(rest);
    },
    end: () => {
      if (stopped || ended) return;
      ended = true;
      const rest = buffer.flush();
      if (rest) enqueue(rest);
      if (!running && queue.length === 0) finish();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      queue.length = 0;
      current?.stop();
      finish();
    },
  };
}

/** Say `markdown` aloud in a delivery that fits `tone` (a whole reply, not one still being written). */
export async function speak(markdown: string, options: Options = {}): Promise<Speaking> {
  const session = startSpeech(options);
  session.push(markdown);
  session.end();
  return session;
}

/** Test helper: forget that the server voice failed. */
export function resetSpeakerState(): void {
  serverVoiceDownUntil = 0;
}
