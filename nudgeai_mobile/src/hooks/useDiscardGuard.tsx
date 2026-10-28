import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { ConfirmDialog } from '@/components/ui';

type Action = unknown;

type NavigationWithGuard = {
  addListener: (
    event: 'beforeRemove',
    listener: (e: { preventDefault: () => void; data: { action: Action } }) => void
  ) => () => void;
  dispatch: (action: Action) => void;
};

/**
 * Intercepts leaving a screen (back button, swipe, hardware back) while `dirty` and asks first.
 * Call `allowLeave()` right before navigating away after a successful save so it isn't blocked.
 * Render `dialog` somewhere in the screen.
 */
export function useDiscardGuard(dirty: boolean): { dialog: ReactElement; allowLeave: () => void } {
  const navigation = useNavigation() as unknown as NavigationWithGuard;
  const [pending, setPending] = useState<Action | null>(null);
  const bypass = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (bypass.current) return;
      e.preventDefault();
      setPending(e.data.action);
    });
  }, [dirty, navigation]);

  const dialog = (
    <ConfirmDialog
      visible={pending !== null}
      title="Discard changes?"
      message="You have unsaved changes. If you leave now they’ll be lost."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const action = pending;
        setPending(null);
        bypass.current = true;
        if (action) navigation.dispatch(action);
      }}
    />
  );

  return {
    dialog,
    allowLeave: () => {
      bypass.current = true;
    },
  };
}
