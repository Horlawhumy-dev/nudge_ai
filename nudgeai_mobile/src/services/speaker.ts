import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';

import { DEMO_MODE } from '@/constants/env';
import type { ToneId } from '@/features/onboarding/data';
import { deliveryFor, spokenText } from '@/features/settings/voice';
import { speakableText } from '@/lib/speakable';

import { speechApi } from './api/endpoints/speech';

export type Speaking = { stop: () => void };

type Options = {
  tone?: ToneId;
  /** Called once when the voice stops for any reason: finished, stopped or failed. */
  onEnd?: () => void;
};

/** After the server voice fails, skip it for a while so each line doesn't wait on a dead service. */
const RETRY_AFTER_MS = 5 * 60_000;
let serverVoiceDownUntil = 0;

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
  const file = new File(Paths.cache, `nudge-voice-${Date.now()}.mp3`);
  file.create({ overwrite: true });
  file.write(bytes);

  await setAudioModeAsync({ playsInSilentMode: true });
  const player = createAudioPlayer({ uri: file.uri });
  player.shouldCorrectPitch = true;
  player.playbackRate = deliveryFor(tone).rate;

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

/**
 * Say `markdown` aloud, in a delivery that fits `tone`. Uses the ElevenLabs voice through the
 * backend; if that isn't set up or fails, quietly uses the phone's built-in voice instead.
 * Resolves as soon as speech has started (or failed over); `onEnd` fires when it stops.
 */
export async function speak(markdown: string, options: Options = {}): Promise<Speaking> {
  const tone = options.tone ?? 'mix';
  // No formatting characters, no quotation marks, a pause instead of a spoken dash.
  const text = spokenText(speakableText(markdown));
  const onEnd = options.onEnd ?? (() => undefined);
  if (!text) {
    onEnd();
    return { stop: () => undefined };
  }

  if (!DEMO_MODE && Date.now() >= serverVoiceDownUntil) {
    try {
      const handle = await playBytes(await speechApi.synthesize(text), tone, onEnd);
      if (__DEV__) console.log('[nudge] speaking with the ElevenLabs voice');
      return handle;
    } catch (e) {
      serverVoiceDownUntil = Date.now() + RETRY_AFTER_MS;
      if (__DEV__)
        console.log(`[nudge] ElevenLabs voice unavailable, using the phone's: ${String(e)}`);
    }
  } else if (__DEV__) {
    console.log(
      '[nudge] speaking with the phone voice (demo mode or server voice recently failed)'
    );
  }
  return speakOnDevice(text, tone, onEnd);
}

/** Test helper: forget that the server voice failed. */
export function resetSpeakerState(): void {
  serverVoiceDownUntil = 0;
}
