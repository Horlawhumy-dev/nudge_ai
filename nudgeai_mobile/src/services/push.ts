import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { devicesApi } from '@/services/api/endpoints/notifications';
import { getPushToken } from '@/services/notifications';

const KEY = 'nudge.pushToken';

/** Tell the server where to send this phone's notifications. Safe to call on every launch. */
export async function registerDevice(): Promise<void> {
  const token = await getPushToken();
  if (!token) return;
  await devicesApi.register(
    token,
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'android'
  );
  await AsyncStorage.setItem(KEY, token);
}

/** Stop sending to this phone (on sign-out, so the next person to use it gets nothing). */
export async function unregisterDevice(): Promise<void> {
  const token = await AsyncStorage.getItem(KEY);
  if (!token) return;
  await devicesApi.unregister(token);
  await AsyncStorage.removeItem(KEY);
}
