import { useState } from 'react';

import type { FieldError } from '@/lib/validation';

/**
 * State for one validated form field.
 *
 * - `error` is always computed from the current value (use it to enable/disable submit).
 * - `visibleError` is what to *show*: nothing while the user is still typing for the first time,
 *   the validation message after they leave the field (or after a failed submit), and any
 *   server/API error until they edit the value again.
 * - `props` can be spread onto `TextField` (`value`, `onChangeText`, `onBlur`, `error`, `success`).
 */
export function useField(initial: string, validate: (value: string) => FieldError) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const error = validate(value);
  const visibleError = remoteError ?? (touched ? error : null);
  const valid = error === null && value.length > 0;

  const onChangeText = (next: string) => {
    setValue(next);
    setRemoteError(null);
  };

  return {
    value,
    setValue: onChangeText,
    error,
    visibleError,
    valid,
    touched,
    /** Mark as touched so the validation message appears (e.g. after a failed submit). */
    touch: () => setTouched(true),
    /** Show an error that came from the "server" (e.g. email already registered). */
    setRemoteError,
    reset: () => {
      setValue(initial);
      setTouched(false);
      setRemoteError(null);
    },
    props: {
      value,
      onChangeText,
      onBlur: () => setTouched(true),
      error: visibleError ?? undefined,
      success: touched && valid && remoteError === null,
    },
  };
}

export type Field = ReturnType<typeof useField>;
