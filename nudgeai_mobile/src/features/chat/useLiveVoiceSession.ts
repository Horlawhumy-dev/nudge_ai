import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSpeaker } from '@/hooks/useSpeaker';
import { concatInt16, encodeWav, resampleInt16, SPEECH_SAMPLE_RATE, toMono } from '@/lib/wav';
import { speechApi } from '@/services/api/endpoints/speech';
import { ApiError } from '@/services/api/errors';
import { openLiveTranscription, type LiveTranscription } from '@/services/liveTranscribe';
import { useChatStore } from '@/store/useChatStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { toast } from '@/store/useToastStore';

import type { VoicePhase } from './useVoiceSession';

/** A voice note is a sentence or two; this also keeps the upload far below Meta's 10 minutes. */
const MAX_RECORDING_MS = 60_000;
/** Shorter than this is a stray tap, not speech. */
const MIN_SAMPLES = SPEECH_SAMPLE_RATE * 0.4;

/**
 * How long to wait for the finished sentence after the person taps stop, before falling back to
 * uploading the recording. Short when the model has heard nothing at all (a stray tap).
 */
export const liveWait = { heardMs: 4_000, silentMs: 1_500 };

/** Mm, uh, "..." and the like: nothing to send to the assistant. */
const isNoise = (text: string) => !/[\p{L}\p{N}]/u.test(text);

/**
 * Real voice mode. The microphone is captured as 16 kHz mono PCM and streamed to the backend,
 * which relays it to Meta's realtime speech model: words appear while you speak, and when you
 * pause the sentence is sent on its own, with no tap and no upload. If live transcription isn't
 * available the same audio (kept in memory) is uploaded as a WAV instead. Nothing is written to
 * disk and the server keeps no audio.
 */
export function useLiveVoiceSession() {
  const send = useChatStore((s) => s.send);
  // "Voice" in notification settings: when off, replies stay silent text.
  const readRepliesAloud = usePreferencesStore((s) => s.notifications.voice);
  const tone = usePreferencesStore((s) => s.tone);
  const { begin, stop: stopSpeaking } = useSpeaker();
  const [phase, setPhaseState] = useState<VoicePhase>('idle');
  const [heard, setHeard] = useState('');
  // The phase also lives in a ref, because callbacks from the live connection outlive renders.
  const phaseRef = useRef<VoicePhase>('idle');
  const chunks = useRef<Int16Array[]>([]);
  const format = useRef({ sampleRate: SPEECH_SAMPLE_RATE, channels: 1 });
  const paused = useRef(false);
  const limit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // False once the screen is gone, so a late permission prompt or upload doesn't toast over Home.
  const alive = useRef(true);
  // Said once per visit, so a silent reply is explained without nagging on every turn.
  const toldVoiceIsOff = useRef(false);
  const live = useRef<LiveTranscription | null>(null);
  const gotWords = useRef(false);
  const turnWaiter = useRef<((text: string | null) => void) | null>(null);
  const onTurnRef = useRef<(text: string) => void>(() => undefined);

  const setPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const { stream } = useAudioStream({
    sampleRate: SPEECH_SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      if (paused.current) return;
      format.current = { sampleRate: buffer.sampleRate, channels: buffer.channels };
      const samples = new Int16Array(buffer.data.slice(0));
      chunks.current.push(samples); // always kept: the fallback if live doesn't deliver
      live.current?.sendAudio(
        buffer.sampleRate === SPEECH_SAMPLE_RATE && buffer.channels === 1
          ? samples
          : resampleInt16(toMono(samples, buffer.channels), buffer.sampleRate, SPEECH_SAMPLE_RATE)
      );
    },
  });

  // The library frees the native stream when this screen unmounts, and stopping one that is
  // already freed (or was never started) throws. Either way the microphone is off, which is all
  // we wanted, so that error is safe to ignore.
  const stopStream = useCallback(() => {
    try {
      stream.stop();
    } catch {
      // already released or not running
    }
  }, [stream]);

  const closeLive = useCallback(() => {
    live.current?.close();
    live.current = null;
  }, []);

  /** Send what was said to the assistant, and speak its reply while it is still being written. */
  const submitText = useCallback(
    async (text: string) => {
      if (!alive.current) return;
      setHeard(text);
      setPhase('generating');
      // Each sentence is voiced as soon as it is complete, so Nudge starts talking after the first
      // one rather than after the whole reply.
      const speech = readRepliesAloud ? begin(tone) : null;
      let streamed = false;
      const reply = await send(text, {
        via: 'voice',
        onDelta: (piece) => {
          streamed = true;
          speech?.push(piece);
        },
        // A lead-in like "Let me check." is about to be replaced by the real answer: say it first.
        onReset: () => speech?.flush(),
      });
      setPhase('idle');
      if (!reply || reply.failed || !alive.current) {
        speech?.stop(); // never read an error message out loud
        return;
      }
      if (speech) {
        if (!streamed) speech.push(reply.text); // a server that doesn't stream: say it all now
        speech.end();
      } else if (!toldVoiceIsOff.current) {
        toldVoiceIsOff.current = true;
        toast.show('Spoken replies are off. Turn on “Voice” in Settings → Notifications.');
      }
    },
    [send, begin, tone, readRepliesAloud, setPhase]
  );

  /** The fallback: upload the whole recording and wait for the transcript. */
  const transcribeRecording = useCallback(async () => {
    const { sampleRate, channels } = format.current;
    const raw = concatInt16(chunks.current);
    chunks.current = [];
    const samples = resampleInt16(toMono(raw, channels), sampleRate, SPEECH_SAMPLE_RATE);
    if (!alive.current) return;
    if (samples.length < MIN_SAMPLES) {
      toast.show('I didn’t catch anything. Tap the mic and try again.');
      setPhase('idle');
      return;
    }

    setPhase('transcribing');
    let text: string;
    try {
      text = (await speechApi.transcribe(encodeWav(samples, SPEECH_SAMPLE_RATE))).text;
    } catch (e) {
      if (!alive.current) return;
      // 502 from the server also covers "no speech was recognised".
      toast.error(
        e instanceof ApiError && e.message
          ? e.message
          : 'Couldn’t transcribe that. Check your connection and try again.'
      );
      setPhase('idle');
      return;
    }
    await submitText(text);
  }, [submitText, setPhase]);

  /** After a tap on stop: tell the live session, and wait (briefly) for the finished sentence. */
  const waitForTurn = useCallback((session: LiveTranscription) => {
    return new Promise<string | null>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (text: string | null) => {
        clearTimeout(timer);
        turnWaiter.current = null;
        resolve(text);
      };
      turnWaiter.current = settle;
      timer = setTimeout(
        () => settle(null),
        gotWords.current ? liveWait.heardMs : liveWait.silentMs
      );
      session.stop();
    });
  }, []);

  const finish = useCallback(async () => {
    clearTimeout(limit.current);
    stopStream();
    const session = live.current;
    if (session) {
      setPhase('transcribing');
      const text = await waitForTurn(session);
      closeLive();
      if (!alive.current) return;
      if (text) {
        chunks.current = [];
        await submitText(text);
        return;
      }
      // Live didn't answer in time: fall through to the recording.
    }
    await transcribeRecording();
  }, [stopStream, closeLive, waitForTurn, submitText, transcribeRecording, setPhase]);

  // The model decided the sentence is over (hands-free), or answered a tap on stop.
  useEffect(() => {
    onTurnRef.current = (raw: string) => {
      const text = raw.trim();
      if (isNoise(text)) return;
      if (turnWaiter.current) {
        turnWaiter.current(text);
        return;
      }
      if (phaseRef.current !== 'listening') return;
      clearTimeout(limit.current);
      stopStream();
      closeLive();
      chunks.current = [];
      void submitText(text);
    };
  }, [stopStream, closeLive, submitText]);

  const listen = useCallback(async () => {
    stopSpeaking(); // never record over our own voice
    const permission = await requestRecordingPermissionsAsync();
    if (!alive.current) return;
    if (!permission.granted) {
      toast.error('Allow microphone access in Settings to talk to Nudge.');
      setPhase('idle');
      return;
    }
    try {
      chunks.current = [];
      paused.current = false;
      gotWords.current = false;
      setHeard('');
      // Connecting to the speech model takes about a second and a half, so start it now and let
      // it overlap with the microphone starting; audio is held until the connection is ready.
      closeLive();
      live.current = openLiveTranscription({
        onPartial: (text) => {
          gotWords.current = true;
          if (alive.current) setHeard(text);
        },
        onTurn: (text) => onTurnRef.current(text),
        onFail: () => {
          live.current = null; // the recording is still being kept; stopping will upload it
          turnWaiter.current?.(null);
        },
      });
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await stream.start();
      if (!alive.current) {
        stopStream();
        closeLive();
        return;
      }
      setPhase('listening');
      limit.current = setTimeout(() => void finish(), MAX_RECORDING_MS);
    } catch {
      closeLive();
      if (!alive.current) return;
      toast.error('Couldn’t start the microphone. Try again.');
      setPhase('idle');
    }
  }, [finish, stream, stopStream, stopSpeaking, closeLive, setPhase]);

  // Start listening as soon as voice mode opens; always release the microphone on the way out.
  useEffect(() => {
    alive.current = true;
    const start = setTimeout(() => void listen(), 0);
    return () => {
      alive.current = false;
      clearTimeout(start);
      clearTimeout(limit.current);
      stopStream();
      closeLive();
    };
    // Only on open/close: `listen` changes identity but must not restart a running session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = useCallback(() => {
    if (phase === 'listening' || phase === 'paused') void finish();
    else if (phase === 'idle') void listen();
  }, [phase, finish, listen]);

  const togglePause = useCallback(() => {
    if (phase === 'listening') {
      paused.current = true;
      setPhase('paused');
    } else if (phase === 'paused') {
      paused.current = false;
      setPhase('listening');
    }
  }, [phase, setPhase]);

  return {
    phase,
    transcript: { heard, pending: '' },
    toggleMic,
    togglePause,
  };
}
