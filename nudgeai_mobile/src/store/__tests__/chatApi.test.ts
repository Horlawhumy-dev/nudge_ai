import type { SseEvent } from '@/services/api/sse';
import { ApiError } from '@/services/api/errors';
import { conversationsApi, proposalsApi, streamChat } from '@/services/api/endpoints/chat';
import { visionApi } from '@/services/api/endpoints/vision';
import { syncPlanner } from '@/services/sync';

import { useChatStore } from '../useChatStore';
import { useToastStore } from '../useToastStore';

jest.mock('@/constants/env', () => ({
  API_URL: 'http://api.test/v1',
  DEMO_MODE: false,
  DEMO_EMAIL: 'demo@nudge.ai',
  DEMO_PASSWORD: 'Password1!',
  DEMO_CODE: '1234',
}));
jest.mock('@/services/api/endpoints/chat');
jest.mock('@/services/api/endpoints/vision');
jest.mock('@/services/sync', () => ({
  syncPlanner: jest.fn(async () => undefined),
  syncData: jest.fn(async () => undefined),
}));

const stream = jest.mocked(streamChat);
const proposals = jest.mocked(proposalsApi);
const conversations = jest.mocked(conversationsApi);

/** Make the next turn emit these server events. */
const serverSays = (events: SseEvent[]) =>
  stream.mockImplementation(async (_body, onEvent) => events.forEach(onEvent));

const active = () => {
  const { conversations: all, activeId } = useChatStore.getState();
  return all.find((c) => c.id === activeId)!;
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(syncPlanner).mockResolvedValue(undefined);
  useChatStore.getState().clear();
  useToastStore.setState({ current: null });
});

describe('chat against a backend', () => {
  it('sends the message, keeps the server conversation id and shows the reply', async () => {
    serverSays([
      { event: 'conversation', data: { id: 'srv-c1', title: 'Plan my day' } },
      { event: 'message', data: { content: 'Here is your day.' } },
      { event: 'meta', data: { trace_id: 'tr-1' } },
      { event: 'done', data: {} },
    ]);
    await useChatStore.getState().send('Plan my day', { via: 'voice' });

    expect(stream).toHaveBeenCalledWith(
      { message: 'Plan my day', conversation_id: undefined, via: 'voice' },
      expect.any(Function)
    );
    const convo = active();
    expect(convo).toMatchObject({ serverId: 'srv-c1', title: 'Plan my day' });
    expect(convo.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'Plan my day'],
      ['assistant', 'Here is your day.'],
    ]);
    expect(convo.messages[1].traceId).toBe('tr-1');
    expect(useChatStore.getState().isReplying).toBe(false);
  });

  it('continues the same server conversation on the next message', async () => {
    serverSays([
      { event: 'conversation', data: { id: 'srv-c1', title: 't' } },
      { event: 'message', data: { content: 'one' } },
    ]);
    await useChatStore.getState().send('first');
    await useChatStore.getState().send('second');
    expect(stream).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversation_id: 'srv-c1' }),
      expect.any(Function)
    );
  });

  it('attaches proposals to the reply and confirms one, then refreshes habits and tasks', async () => {
    serverSays([
      { event: 'message', data: { content: 'I can move it.' } },
      {
        event: 'proposal',
        data: { id: 'p1', tool: 'task_update', summary: 'Change “Deep work”: start time 11:00' },
      },
    ]);
    await useChatStore.getState().send('push deep work to 11');
    const reply = active().messages[1];
    expect(reply.proposals).toMatchObject([
      { id: 'p1', summary: 'Change “Deep work”: start time 11:00', status: 'pending' },
    ]);

    proposals.confirm.mockResolvedValue(undefined);
    await useChatStore.getState().resolveProposal(reply.id, 'p1', 'confirm');
    expect(proposals.confirm).toHaveBeenCalledWith('p1');
    expect(active().messages[1].proposals?.[0].status).toBe('confirmed');
    expect(syncPlanner).toHaveBeenCalled();
  });

  it('declining a proposal does not touch the user’s data', async () => {
    serverSays([
      { event: 'message', data: { content: 'ok' } },
      {
        event: 'proposal',
        data: { id: 'p2', tool: 'task_create', summary: 'Add task: Water plants' },
      },
    ]);
    await useChatStore.getState().send('add a task');
    proposals.reject.mockResolvedValue(undefined);
    await useChatStore.getState().resolveProposal(active().messages[1].id, 'p2', 'reject');
    expect(active().messages[1].proposals?.[0].status).toBe('rejected');
    expect(syncPlanner).not.toHaveBeenCalled();
  });

  it('shows why a confirmed change failed (plan limit) on the card', async () => {
    serverSays([
      { event: 'message', data: { content: 'ok' } },
      {
        event: 'proposal',
        data: { id: 'p3', tool: 'habit_create', summary: 'Add habit: Meditate' },
      },
    ]);
    await useChatStore.getState().send('new habit');
    proposals.confirm.mockRejectedValue(
      new ApiError('Free includes 3 habits. Upgrade to add more.', 400)
    );
    await useChatStore.getState().resolveProposal(active().messages[1].id, 'p3', 'confirm');
    expect(active().messages[1].proposals?.[0]).toMatchObject({
      status: 'failed',
      error: 'Free includes 3 habits. Upgrade to add more.',
    });
  });

  it('lets the user try again when offline, without duplicating their message', async () => {
    stream.mockRejectedValueOnce(new ApiError('offline', 0));
    await useChatStore.getState().send('hello');
    const failed = active().messages[1];
    expect(failed).toMatchObject({ failed: true });
    expect(failed.text).toMatch(/connection/);

    serverSays([{ event: 'message', data: { content: 'Hi!' } }]);
    await useChatStore.getState().retry(failed.id);
    expect(active().messages.map((m) => m.text)).toEqual(['hello', 'Hi!']);
  });

  it('tells the user when the daily AI allowance is used up', async () => {
    serverSays([
      { event: 'message', data: { content: 'short answer' } },
      { event: 'budget', data: { degraded: true } },
    ]);
    await useChatStore.getState().send('hi');
    expect(useToastStore.getState().current?.message).toMatch(/allowance/);
  });

  it('loads the server history and keeps the conversation on screen', async () => {
    conversations.list.mockResolvedValue([
      { id: 'c1', title: 'Morning plan', created_at: '2026-01-05T08:00:00Z' },
    ]);
    conversations.get.mockResolvedValue({
      id: 'c1',
      title: 'Morning plan',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'plan',
          via: 'text',
          created_at: '2026-01-05T08:00:00Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'sure',
          via: 'text',
          created_at: '2026-01-05T08:00:01Z',
        },
      ],
    });
    await useChatStore.getState().loadHistory();
    const [convo] = useChatStore.getState().conversations;
    expect(convo).toMatchObject({ id: 'c1', serverId: 'c1', title: 'Morning plan' });
    expect(convo.messages).toHaveLength(2);
  });

  it('deleting a chat removes it on the server too', async () => {
    serverSays([
      { event: 'conversation', data: { id: 'srv-9', title: 't' } },
      { event: 'message', data: { content: 'x' } },
    ]);
    await useChatStore.getState().send('hi');
    conversations.remove.mockResolvedValue(undefined);
    useChatStore.getState().deleteConversation(active().id);
    expect(conversations.remove).toHaveBeenCalledWith('srv-9');
    expect(useChatStore.getState().conversations).toEqual([]);
  });

  it('turns a photo into proposals the user can confirm', async () => {
    jest.mocked(visionApi.extract).mockResolvedValue({
      message: 'I found two tasks.',
      proposals: [
        {
          id: 'p1',
          tool: 'task_create',
          args: {},
          summary: 'Add task: Buy milk',
          status: 'pending',
        },
        {
          id: 'p2',
          tool: 'task_create',
          args: {},
          summary: 'Add task: Call dentist',
          status: 'pending',
        },
      ],
    });
    await useChatStore.getState().sendPhoto('file:///list.jpg');
    const convo = active();
    expect(convo.messages.map((m) => m.text)).toEqual(['📷 Photo', 'I found two tasks.']);
    expect(convo.messages[1].proposals?.map((p) => p.summary)).toEqual([
      'Add task: Buy milk',
      'Add task: Call dentist',
    ]);
    expect(useChatStore.getState().isReplying).toBe(false);
  });

  it('sends the instructions typed with a photo along with it', async () => {
    jest.mocked(visionApi.extract).mockResolvedValue({ message: 'Done.', proposals: [] });
    await useChatStore.getState().sendPhoto('file:///list.jpg', '  these are for next week ');
    expect(visionApi.extract).toHaveBeenCalledWith('file:///list.jpg', 'these are for next week');
    expect(active().messages[0].text).toBe('📷 these are for next week');
  });

  it('explains an unreadable or oversized photo instead of failing silently', async () => {
    jest.mocked(visionApi.extract).mockRejectedValue(new ApiError('too big', 413));
    await useChatStore.getState().sendPhoto('file:///huge.jpg');
    expect(active().messages[1].text).toMatch(/too large/);
    jest.mocked(visionApi.extract).mockRejectedValue(new ApiError('boom', 502));
    await useChatStore.getState().sendPhoto('file:///blurry.jpg');
    expect(active().messages[3].text).toMatch(/clearer/);
  });

  describe('a reply that streams in', () => {
    const texts = () => active().messages.map((m) => m.text);

    it('appears with the first word, grows in place, and is finalised without a duplicate', async () => {
      const seen: { texts: string[]; streaming: boolean; replying: boolean }[] = [];
      const snap = () =>
        seen.push({
          texts: texts(),
          streaming: useChatStore.getState().streaming,
          replying: useChatStore.getState().isReplying,
        });
      stream.mockImplementation(async (_body, onEvent) => {
        onEvent({ event: 'conversation', data: { id: 'srv', title: 't' } });
        onEvent({ event: 'delta', data: { content: 'Okay, ' } });
        snap();
        onEvent({ event: 'delta', data: { content: 'I added it.' } });
        snap();
        onEvent({ event: 'message', data: { content: 'Okay, I added it.' } });
        onEvent({ event: 'meta', data: { trace_id: 'tr-9' } });
      });

      const reply = await useChatStore.getState().send('book it', { via: 'voice' });

      expect(seen[0]).toEqual({ texts: ['book it', 'Okay, '], streaming: true, replying: true });
      expect(seen[1].texts).toEqual(['book it', 'Okay, I added it.']);
      // finished: the same bubble, finalised with the trace, and nothing duplicated
      expect(texts()).toEqual(['book it', 'Okay, I added it.']);
      expect(active().messages[1].id).toBe(reply?.id);
      expect(active().messages[1].traceId).toBe('tr-9');
      expect(useChatStore.getState()).toMatchObject({ streaming: false, isReplying: false });
    });

    it('hands every piece to the caller, and tells it when earlier words are replaced', async () => {
      const pieces: string[] = [];
      const resets: number[] = [];
      stream.mockImplementation(async (_body, onEvent) => {
        onEvent({ event: 'delta', data: { content: 'Let me check.' } });
        onEvent({ event: 'reset', data: {} });
        onEvent({ event: 'delta', data: { content: 'You are free.' } });
        onEvent({ event: 'message', data: { content: 'You are free.' } });
      });
      await useChatStore.getState().send('plan my day', {
        onDelta: (p) => pieces.push(p),
        onReset: () => resets.push(pieces.length),
      });
      expect(pieces).toEqual(['Let me check.', 'You are free.']);
      expect(resets).toEqual([1]); // the reset came after the first piece
      expect(texts()).toEqual(['plan my day', 'You are free.']); // only the real answer remains
    });

    it('clears the lead-in on screen when the answer starts', async () => {
      const shown: string[] = [];
      stream.mockImplementation(async (_body, onEvent) => {
        onEvent({ event: 'delta', data: { content: 'Let me check.' } });
        shown.push(texts()[1]);
        onEvent({ event: 'reset', data: {} });
        shown.push(texts()[1]);
        onEvent({ event: 'delta', data: { content: 'All clear.' } });
        shown.push(texts()[1]);
        onEvent({ event: 'message', data: { content: 'All clear.' } });
      });
      await useChatStore.getState().send('plan my day');
      expect(shown).toEqual(['Let me check.', '', 'All clear.']);
    });

    it('turns a half-written reply into an honest failure in the same bubble', async () => {
      stream.mockImplementation(async (_body, onEvent) => {
        onEvent({ event: 'delta', data: { content: 'Sure, I can' } });
        throw new ApiError('offline', 0);
      });
      await useChatStore.getState().send('hello');
      expect(active().messages).toHaveLength(2); // not two assistant bubbles
      expect(active().messages[1]).toMatchObject({ failed: true });
      expect(active().messages[1].text).toMatch(/connection/);
      expect(useChatStore.getState().streaming).toBe(false);
    });

    it('still works with a server that sends the reply only at the end', async () => {
      serverSays([{ event: 'message', data: { content: 'All good.' } }]);
      await useChatStore.getState().send('hello');
      expect(texts()).toEqual(['hello', 'All good.']);
      expect(useChatStore.getState().streaming).toBe(false);
    });
  });
});

describe('suggested tasks need their day and time approved', () => {
  const task = (over: object = {}) => ({
    id: 'p1',
    summary: 'Add task: Dentist on 2026-11-02 at 15:00',
    status: 'pending' as const,
    tool: 'task_create',
    args: { title: 'Dentist', date: '2026-11-02', start_time: '15:00' },
    whenConfirmed: false,
    ...over,
  });
  const seed = (p: object) =>
    useChatStore.setState({
      conversations: [
        {
          id: 'c1',
          createdAt: 1,
          messages: [{ id: 'm1', role: 'assistant', text: 'ok', proposals: [p as never] }],
        },
      ],
      activeId: 'c1',
    });
  const card = () => useChatStore.getState().conversations[0].messages[0].proposals?.[0];

  it('sends the day and time shown on the card before confirming', async () => {
    seed(task());
    proposals.edit.mockResolvedValue({} as never);
    proposals.confirm.mockResolvedValue(undefined);
    await useChatStore.getState().resolveProposal('m1', 'p1', 'confirm');
    expect(proposals.edit).toHaveBeenCalledWith('p1', { date: '2026-11-02', start_time: '15:00' });
    expect(proposals.confirm).toHaveBeenCalledWith('p1');
    expect(card()?.status).toBe('confirmed');
  });

  it('does not repeat the approval once the person has edited it', async () => {
    seed(task({ whenConfirmed: true }));
    proposals.confirm.mockResolvedValue(undefined);
    await useChatStore.getState().resolveProposal('m1', 'p1', 'confirm');
    expect(proposals.edit).not.toHaveBeenCalled();
  });

  it('keeps an edit on the card and reports why a bad one was refused', async () => {
    seed(task());
    proposals.edit.mockResolvedValueOnce({
      summary: 'Add task: Dentist on 2026-11-03 at 16:30',
      args: { title: 'Dentist', date: '2026-11-03', start_time: '16:30' },
    } as never);
    const ok = await useChatStore
      .getState()
      .editProposal('m1', 'p1', { date: '2026-11-03', start_time: '16:30' });
    expect(ok).toBeNull();
    expect(card()).toMatchObject({
      summary: 'Add task: Dentist on 2026-11-03 at 16:30',
      whenConfirmed: true,
    });

    proposals.edit.mockRejectedValueOnce(new ApiError('Pick a date.', 409));
    expect(await useChatStore.getState().editProposal('m1', 'p1', {})).toBe('Pick a date.');
  });
});
