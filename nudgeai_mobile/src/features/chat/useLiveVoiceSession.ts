import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { concatInt16, encodeWav, resampleInt16, SPEECH_SAMPLE_RATE, toMono } from '@/lib/wav';
import { speechApi } from '@/services/api/endpoints/speech';
import { ApiError } from '@/services/api/errors';
import { useChatStore } from '@/store/useChatStore';
import { toast } from '@/store/useToastStore';

import type { VoicePhase } from './useVoiceSession';

/** A voice note is a sentence or two; this also keeps the upload far below Meta's 10 minutes. */
const MAX_RECORDING_MS = 60_000;
/** Shorter than this is a stray tap, not speech. */
const MIN_SAMPLES = SPEECH_SAMPLE_RATE * 0.4;

/**
 * Real voice mode: the microphone is captured as 16 kHz mono PCM in memory, wrapped as WAV,
 * transcribed by the backend (Meta's speech model) and sent to the assistant as a voice message.
 * Nothing is written to disk and the server keeps no audio.
 */
export function useLiveVoiceSession() {
  const send = useChatStore((s) => s.send);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [heard, setHeard] = useState('');
  const chunks = useRef<Int16Array[]>([]);
  const format = useRef({ sampleRate: SPEECH_SAMPLE_RATE, channels: 1 });
  const paused = useRef(false);
  const limit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { stream } = useAudioStream({
    sampleRate: SPEECH_SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      if (paused.current) return;
      format.current = { sampleRate: buffer.sampleRate, channels: buffer.channels };
      chunks.current.push(new Int16Array(buffer.data.slice(0)));
    },
  });

  const finish = useCallback(async () => {
    clearTimeout(limit.current);
    stream.stop();
    const { sampleRate, channels } = format.current;
    const raw = concatInt16(chunks.current);
    chunks.current = [];
    const samples = resampleInt16(toMono(raw, channels), sampleRate, SPEECH_SAMPLE_RATE);
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
      // 502 from the server also covers "no speech was recognised".
      toast.error(
        e instanceof ApiError && e.message
          ? e.message
          : 'Couldn’t transcribe that. Check your connection and try again.'
      );
      setPhase('idle');
      return;
    }
    setHeard(text);
    setPhase('generating');
    await send(text, { via: 'voice' });
    setPhase('idle');
  }, [send, stream]);

  const listen = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow microphone access in Settings to talk to Nudge.');
      setPhase('idle');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      chunks.current = [];
      paused.current = false;
      setHeard('');
      await stream.start();
      setPhase('listening');
      limit.current = setTimeout(() => void finish(), MAX_RECORDING_MS);
    } catch {
      toast.error('Couldn’t start the microphone. Try again.');
      setPhase('idle');
    }
  }, [finish, stream]);

  // Start listening as soon as voice mode opens; always release the microphone on the way out.
  useEffect(() => {
    const start = setTimeout(() => void listen(), 0);
    return () => {
      clearTimeout(start);
      clearTimeout(limit.current);
      stream.stop();
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
  }, [phase]);

  return {
    phase,
    transcript: { heard, pending: '' },
    toggleMic,
    togglePause,
  };
}
