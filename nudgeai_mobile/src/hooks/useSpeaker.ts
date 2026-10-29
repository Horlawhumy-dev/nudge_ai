import { useCallback, useEffect, useRef, useState } from 'react';

import type { ToneId } from '@/features/onboarding/data';
import { startSpeech, type SpeechSession } from '@/services/speaker';

/**
 * Speak aloud and know whether it's still going. Starting again replaces the current speech, and
 * leaving the screen cuts it off. `say` speaks a finished text; `begin` returns a session to feed
 * with text as it arrives, so the first sentence is heard while the rest is still being written.
 */
export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSession | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    current.current?.stop();
    current.current = null;
    setSpeaking(false);
  }, []);

  const begin = useCallback(
    (tone?: ToneId): SpeechSession => {
      stop();
      setSpeaking(true);
      const session = startSpeech({
        tone,
        onEnd: () => {
          if (alive.current && current.current === session) setSpeaking(false);
        },
      });
      current.current = session;
      return session;
    },
    [stop]
  );

  const say = useCallback(
    (text: string, tone?: ToneId) => {
      const session = begin(tone);
      session.push(text);
      session.end();
    },
    [begin]
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      current.current?.stop();
    };
  }, []);

  return { speaking, say, begin, stop };
}
