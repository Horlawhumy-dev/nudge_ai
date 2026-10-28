/**
 * Where the backend lives. Set `EXPO_PUBLIC_API_URL` (e.g. `http://192.168.1.20:8079/api/v1`; on
 * a phone use your computer's LAN address, not localhost). Without it the app runs in demo mode:
 * no network, fixed credentials, sample data, so every screen can still be exercised offline.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const DEMO_MODE = API_URL === '';

export const DEMO_EMAIL = 'demo@nudge.ai';
export const DEMO_PASSWORD = 'Password1!';
/** The one-time code the mock "sends" for sign-up and password reset. */
export const DEMO_CODE = '1234';
