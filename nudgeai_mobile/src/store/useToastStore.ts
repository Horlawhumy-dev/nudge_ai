import { create } from 'zustand';

import { createId } from '@/lib/format';

export type ToastTone = 'default' | 'success' | 'error';

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  action?: { label: string; onPress: () => void };
};

type ToastOptions = {
  tone?: ToastTone;
  action?: Toast['action'];
};

type ToastState = {
  current: Toast | null;
  show: (message: string, options?: ToastOptions) => string;
  dismiss: (id?: string) => void;
};

const AUTO_DISMISS_MS = 4000;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,

  show: (message, options = {}) => {
    const id = createId('toast');
    clearTimeout(timer);
    set({ current: { id, message, tone: options.tone ?? 'default', action: options.action } });
    timer = setTimeout(
      () => get().dismiss(id),
      options.action ? AUTO_DISMISS_MS + 2000 : AUTO_DISMISS_MS
    );
    return id;
  },

  dismiss: (id) => {
    if (id && get().current?.id !== id) return;
    clearTimeout(timer);
    set({ current: null });
  },
}));

/** Imperative helper so non-React code (store actions, handlers) can raise a toast. */
export const toast = {
  show: (message: string, options?: ToastOptions) =>
    useToastStore.getState().show(message, options),
  success: (message: string, options?: Omit<ToastOptions, 'tone'>) =>
    useToastStore.getState().show(message, { ...options, tone: 'success' }),
  error: (message: string, options?: Omit<ToastOptions, 'tone'>) =>
    useToastStore.getState().show(message, { ...options, tone: 'error' }),
};
