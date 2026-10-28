import { api } from '../client';
import type { ApiProposal } from './chat';

export type PhotoExtraction = { message: string; proposals: ApiProposal[] };

function mimeOf(uri: string): string {
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export const visionApi = {
  /** Read tasks and habits off a photo (a to-do list, a whiteboard…). Returns proposals only. */
  async extract(uri: string) {
    const blob = await (await fetch(uri)).blob();
    const { data } = await api.post<PhotoExtraction>('/vision/extract', blob, {
      headers: { 'Content-Type': mimeOf(uri) },
      timeout: 90_000,
    });
    return data;
  },
};
