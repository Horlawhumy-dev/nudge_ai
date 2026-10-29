import { File } from 'expo-file-system';

import { api } from '../client';
import type { ApiProposal } from './chat';

export type PhotoExtraction = { message: string; proposals: ApiProposal[] };

/** The picture's own first bytes say what it is; a file name can be wrong (or missing). */
export function mimeOf(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'image/webp';
  return 'image/jpeg';
}

export const visionApi = {
  /** Read tasks and habits off a photo (a to-do list, a whiteboard…). Returns proposals only. */
  async extract(uri: string) {
    const bytes = await new File(uri).bytes(); // read the file itself, not a fetch of its uri
    const { data } = await api.post<PhotoExtraction>('/vision/extract', bytes, {
      headers: { 'Content-Type': mimeOf(bytes) },
      timeout: 90_000,
    });
    return data;
  },
};
