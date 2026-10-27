import { useCallback, useEffect, useState } from 'react';

import { useChatStore } from '@/store/useChatStore';

export type VoicePhase = 'listening' | 'paused' | 'transcribing' | 'generating' | 'idle';

/**
 * Canned utterances the simulated microphone "hears". Real speech-to-text replaces this:
 * keep the phase machine, swap `SCRIPTS` for the transcript stream.
 */
const SCRIPTS = [
  'Hi Nudge! Push my 10am deep work to 11 am please.',
  'Show me my day summary.',
  'Suggest habits for better sleep.',
];

const WORD_MS = 380;
const SETTLE_MS = 700;
const TRANSCRIBE_MS = 700;

export function useVoiceSession() {
  const sendVoice = useChatStore((s) => s.sendVoice);
  const [phase, setPhase] = useState<VoicePhase>('listening');
  const [revealed, setRevealed] = useState(0);
  const [turn, setTurn] = useState(0);
  const script = SCRIPTS[turn % SCRIPTS.length];
  const words = script.split(' ');

  const finish = useCallback(
    async (text: string) => {
      setPhase('transcribing');
      await new Promise((r) => setTimeout(r, TRANSCRIBE_MS));
      setPhase('generating');
      await sendVoice(text);
      setPhase('idle');
    },
    [sendVoice]
  );

  // Reveal the script word by word while listening; auto-finish once it's all been "heard".
  useEffect(() => {
    if (phase !== 'listening') return;
    if (revealed >= words.length) {
      const id = setTimeout(() => void finish(script), SETTLE_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setRevealed((n) => n + 1), WORD_MS);
    return () => clearTimeout(id);
  }, [phase, revealed, words.length, script, finish]);

  const heard = words.slice(0, revealed).join(' ');

  const toggleMic = useCallback(() => {
    if (phase === 'listening') {
      void finish(words.slice(0, Math.max(revealed, 3)).join(' '));
    } else if (phase === 'idle') {
      setTurn((t) => t + 1);
      setRevealed(0);
      setPhase('listening');
    }
  }, [phase, revealed, words, finish]);

  const togglePause = useCallback(() => {
    setPhase((p) => (p === 'listening' ? 'paused' : p === 'paused' ? 'listening' : p));
  }, []);

  return {
    phase,
    transcript: { heard, pending: words.slice(revealed, revealed + 3).join(' ') },
    toggleMic,
    togglePause,
  };
}
