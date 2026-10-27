import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Shared storage engine for persisted stores (AsyncStorage on native, localStorage on web). */
export const persistStorage = createJSONStorage(() => AsyncStorage);

/** Bump when a persisted shape changes incompatibly; pair with a `migrate` in that store. */
export const STORE_VERSION = 1;
