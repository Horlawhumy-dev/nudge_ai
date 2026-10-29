import { fetch as streamingFetch } from 'expo/fetch';

import { API_URL } from '@/constants/env';

import { api, refreshSession } from '../client';
import { ApiError, toApiError } from '../errors';
import { SseParser, type SseEvent } from '../sse';
import { getTokens } from '../tokens';

export type ChatTurnBody = {
  message: string;
  conversation_id?: string;
  via: 'text' | 'voice';
};

export type ApiProposal = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  status: string;
};

export type ApiConversation = { id: string; title: string; created_at: string };
export type ApiConversationDetail = {
  id: string;
  title: string;
  messages: {
    id: string;
    role: string;
    content: string;
    via: 'text' | 'voice';
    created_at: string;
  }[];
};

async function open(body: ChatTurnBody, token: string | null, signal?: AbortSignal) {
  return streamingFetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'ngrok-skip-browser-warning': '1', // see services/api/client.ts
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Send one chat turn and hand each server event to `onEvent` as it arrives.
 * Throws an ApiError if the request is refused (not signed in, rate limited, offline).
 */
export async function streamChat(
  body: ChatTurnBody,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  let response;
  try {
    response = await open(body, (await getTokens())?.accessToken ?? null, signal);
    if (response.status === 401) {
      // The access token expired: refresh once and replay, as the axios client does.
      const fresh = await refreshSession();
      if (fresh) response = await open(body, fresh, signal);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw toApiError(e);
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = (await response.json())?.detail;
    } catch {
      detail = undefined;
    }
    const retry = Number(response.headers.get('retry-after'));
    throw toApiError({
      response: {
        status: response.status,
        data: { detail },
        headers: Number.isFinite(retry) && retry > 0 ? { 'retry-after': retry } : {},
      },
    });
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('Nudge AI isn’t available right now. Try again.', 0);
  const decoder = new TextDecoder();
  const parser = new SseParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true })).forEach(onEvent);
  }
}

export const proposalsApi = {
  async confirm(id: string) {
    await api.post(`/proposals/${id}/confirm`);
  },
  async reject(id: string) {
    await api.post(`/proposals/${id}/reject`);
  },
};

export const conversationsApi = {
  async list(limit = 20) {
    const { data } = await api.get<ApiConversation[]>('/conversations', { params: { limit } });
    return data;
  },
  async get(id: string) {
    const { data } = await api.get<ApiConversationDetail>(`/conversations/${id}`);
    return data;
  },
  async remove(id: string) {
    await api.delete(`/conversations/${id}`);
  },
  async removeAll() {
    await api.delete('/conversations');
  },
};
