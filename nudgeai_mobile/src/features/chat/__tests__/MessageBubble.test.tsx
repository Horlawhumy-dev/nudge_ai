import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { proposalsApi } from '@/services/api/endpoints/chat';
import { ApiError } from '@/services/api/errors';
import { useChatStore } from '@/store/useChatStore';

import { MessageBubble } from '../components/MessageBubble';
import type { ChatMessage } from '../types';

jest.mock('@/constants/env', () => ({ API_URL: 'http://api.test', DEMO_MODE: false }));
jest.mock('@/services/api/endpoints/chat');
jest.mock('@/services/sync', () => ({ syncPlanner: jest.fn(async () => undefined) }));

const confirm = jest.mocked(proposalsApi.confirm);
const reject = jest.mocked(proposalsApi.reject);

const reply: ChatMessage = {
  id: 'm1',
  role: 'assistant',
  text: 'I can book that and nudge you.',
  proposals: [
    { id: 'p1', summary: 'Add task: Dentist at 15:00', status: 'pending' },
    { id: 'p2', summary: 'Add habit: Floss', status: 'pending' },
  ],
};

const current = () => useChatStore.getState().conversations[0].messages[0];

beforeEach(() => {
  jest.clearAllMocks();
  confirm.mockResolvedValue(undefined);
  reject.mockResolvedValue(undefined);
  useChatStore.setState({
    conversations: [{ id: 'c1', createdAt: 1, messages: [reply] }],
    activeId: 'c1',
  });
});

describe('MessageBubble proposals', () => {
  it('confirms a proposal when its Confirm button is pressed', async () => {
    await render(<MessageBubble message={reply} />);
    const buttons = screen.getAllByLabelText('Confirm change');
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[0]);
    await act(async () => undefined);
    expect(confirm).toHaveBeenCalledWith('p1');
    expect(current().proposals?.[0].status).toBe('confirmed');
    expect(current().proposals?.[1].status).toBe('pending'); // the other one is untouched
  });

  it('declines a proposal with Not now, without confirming anything', async () => {
    await render(<MessageBubble message={reply} />);
    await fireEvent.press(screen.getAllByLabelText('Skip change')[1]);
    await act(async () => undefined);
    expect(reject).toHaveBeenCalledWith('p2');
    expect(confirm).not.toHaveBeenCalled();
    expect(current().proposals?.[1].status).toBe('rejected');
  });

  it('shows why a confirmation failed, on the card', async () => {
    confirm.mockRejectedValue(new ApiError('Free includes 3 habits. Upgrade to add more.', 400));
    await render(<MessageBubble message={reply} />);
    await fireEvent.press(screen.getAllByLabelText('Confirm change')[1]);
    await act(async () => undefined);
    expect(current().proposals?.[1]).toMatchObject({
      status: 'failed',
      error: 'Free includes 3 habits. Upgrade to add more.',
    });
  });

  it('offers Try again on a failed reply and resends the question', async () => {
    const failed: ChatMessage = { id: 'm2', role: 'assistant', text: 'Offline', failed: true };
    const asked: ChatMessage = { id: 'm0', role: 'user', text: 'book it', via: 'text' };
    const retry = jest.fn(async () => undefined);
    useChatStore.setState({
      conversations: [{ id: 'c1', createdAt: 1, messages: [asked, failed] }],
      activeId: 'c1',
      retry,
    });
    await render(<MessageBubble message={failed} />);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(retry).toHaveBeenCalledWith('m2');
  });
});

describe('a suggested task', () => {
  const suggestion = (args: Record<string, unknown>): ChatMessage => ({
    id: 'm1',
    role: 'assistant',
    text: 'Here.',
    proposals: [
      { id: 'p1', summary: 'Add task: Dentist', status: 'pending', tool: 'task_create', args },
    ],
  });
  const show = async (message: ChatMessage) => {
    useChatStore.setState({
      conversations: [{ id: 'c1', createdAt: 1, messages: [message] }],
      activeId: 'c1',
    });
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 800 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <MessageBubble message={message} />
      </SafeAreaProvider>
    );
  };

  it('has an Edit button that opens the day and time to check', async () => {
    await show(suggestion({ title: 'Dentist', date: '2026-11-02', start_time: '15:00' }));
    await fireEvent.press(screen.getByLabelText('Edit suggestion'));
    expect(screen.getByTestId('proposal-save')).toBeTruthy();
  });

  it('opens the editor instead of confirming when there is no day', async () => {
    await show(suggestion({ title: 'Dentist' }));
    await fireEvent.press(screen.getByLabelText('Confirm change'));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('proposal-save')).toBeTruthy(); // saving approves the day shown
  });

  it('has no Edit button on other kinds of change', async () => {
    await show({
      id: 'm1',
      role: 'assistant',
      text: 'x',
      proposals: [
        { id: 'p2', summary: 'Add habit: Floss', status: 'pending', tool: 'habit_create' },
      ],
    });
    expect(screen.queryByLabelText('Edit suggestion')).toBeNull();
  });
});
