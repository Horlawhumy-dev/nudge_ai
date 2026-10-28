import axios from 'axios';

import { api } from '../client';
import type { ApiOnboarding, ApiUser } from '../types';

type AvatarIntent = {
  method: 'cloudinary' | 'api';
  max_bytes: number;
  upload_url: string | null;
  fields: Record<string, string> | null;
  file_field: string | null;
};

const UPLOAD_TIMEOUT_MS = 60_000;

function mimeOf(uri: string): { mime: string; ext: string } {
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.png')) return { mime: 'image/png', ext: 'png' };
  if (lower.endsWith('.webp')) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

export const profileApi = {
  async get() {
    const { data } = await api.get<ApiUser>('/profile');
    return data;
  },

  async update(body: { name?: string; timezone?: string }) {
    const { data } = await api.patch<ApiUser>('/profile', body);
    return data;
  },

  async getOnboarding() {
    const { data } = await api.get<ApiOnboarding>('/onboarding');
    return data;
  },

  async saveOnboarding(body: Partial<ApiOnboarding>) {
    const { data } = await api.patch<ApiOnboarding>('/onboarding', body);
    return data;
  },

  /**
   * Set the profile photo from a local file. With Cloudinary the phone uploads straight to it
   * (so there is real progress and our server never carries the bytes); if that fails, or
   * Cloudinary isn't set up, the photo goes through the API instead.
   */
  async uploadAvatar(uri: string, onProgress?: (fraction: number) => void) {
    const { mime, ext } = mimeOf(uri);
    const { data: intent } = await api.post<AvatarIntent>('/profile/avatar/intent');

    if (intent.method === 'cloudinary' && intent.upload_url && intent.fields) {
      try {
        const form = new FormData();
        Object.entries(intent.fields).forEach(([k, v]) => form.append(k, v));
        // React Native reads the file itself from this {uri, name, type} shape.
        form.append(intent.file_field ?? 'file', {
          uri,
          name: `avatar.${ext}`,
          type: mime,
        } as unknown as Blob);
        const { data } = await axios.post<{ secure_url: string }>(intent.upload_url, form, {
          timeout: UPLOAD_TIMEOUT_MS,
          onUploadProgress: (e) => onProgress?.(e.progress ?? 0),
        });
        const { data: user } = await api.put<ApiUser>('/profile/avatar', { url: data.secure_url });
        return user;
      } catch {
        // Fall through to the API route below.
      }
    }

    const blob = await (await fetch(uri)).blob();
    const { data } = await api.post<ApiUser>('/profile/avatar', blob, {
      headers: { 'Content-Type': mime },
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (e) => onProgress?.(e.progress ?? 0),
    });
    return data;
  },

  async removeAvatar() {
    const { data } = await api.delete<ApiUser>('/profile/avatar');
    return data;
  },
};
