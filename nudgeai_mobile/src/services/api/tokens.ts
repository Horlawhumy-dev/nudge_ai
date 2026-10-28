import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type Tokens = { accessToken: string; refreshToken: string };

const KEY = 'nudge.tokens';

/** Keychain / Keystore on devices; plain storage on web, where SecureStore does not exist. */
const store =
  Platform.OS === 'web'
    ? {
        get: (k: string) => AsyncStorage.getItem(k),
        set: (k: string, v: string) => AsyncStorage.setItem(k, v),
        del: (k: string) => AsyncStorage.removeItem(k),
      }
    : {
        get: (k: string) => SecureStore.getItemAsync(k),
        set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
        del: (k: string) => SecureStore.deleteItemAsync(k),
      };

let cache: Tokens | null | undefined; // undefined = not read from disk yet

export async function getTokens(): Promise<Tokens | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await store.get(KEY);
    cache = raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    cache = null;
  }
  return cache;
}

export async function setTokens(tokens: Tokens): Promise<void> {
  cache = tokens;
  try {
    await store.set(KEY, JSON.stringify(tokens));
  } catch {
    // Still usable for this session; the user just signs in again next launch.
  }
}

export async function clearTokens(): Promise<void> {
  cache = null;
  try {
    await store.del(KEY);
  } catch {
    // Nothing more to do: the in-memory copy is already gone.
  }
}

/** Test helper: forget the in-memory copy so the next read goes to storage. */
export function resetTokenCache(): void {
  cache = undefined;
}

type Listener = () => void;
const expiredListeners = new Set<Listener>();

/** Called when a refresh fails, i.e. the session is really over. The auth store signs out. */
export function onSessionExpired(listener: Listener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

export function notifySessionExpired(): void {
  expiredListeners.forEach((l) => l());
}
