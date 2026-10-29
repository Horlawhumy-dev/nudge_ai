import { useCallback, useEffect, useRef, useState } from 'react';

import type { ToneId } from '@/features/onboarding/data';
import { speak, type Speaking } from '@/services/speaker';

/**
 * Speak text aloud and know whether it's still going. Speaking again replaces the current
 * line, and leaving the screen cuts it off.
 */
export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<Speaking | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    current.current?.stop();
    current.current = null;
    setSpeaking(false);
  }, []);

  const say = useCallback(
    async (text: string, tone?: ToneId) => {
      stop();
      setSpeaking(true);
      const handle = await speak(text, {
        tone,
        onEnd: () => {
          if (alive.current) setSpeaking(false);
        },
      });
      if (!alive.current) {
        handle.stop();
        return;
      }
      current.current = handle;
    },
    [stop]
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      current.current?.stop();
    };
  }, []);

  return { speaking, say, stop };
}
