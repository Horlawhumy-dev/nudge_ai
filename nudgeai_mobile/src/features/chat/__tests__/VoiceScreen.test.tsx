import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Voice from '@/app/(main)/chat/voice';
import { proposalsApi } from '@/services/api/endpoints/chat';
import { useChatStore } from '@/store/useChatStore';

jest.mock('@/constants/env', () => ({ API_URL: 'http://api.test', DEMO_MODE: false }));
jest.mock('@/services/api/endpoints/chat');
jest.mock('@/services/sync', () => ({ syncPlanner: jest.fn(async () => undefined) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/features/chat/useVoiceSession', () => ({
  useVoiceSession: () => ({
    phase: 'idle',
    transcript: { heard: '', pending: '' },
    toggleMic: jest.fn(),
    togglePause: jest.fn(),
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const confirm = jest.mocked(proposalsApi.confirm);

beforeEach(() => {
  jest.clearAllMocks();
  confirm.mockResolvedValue(undefined);
  useChatStore.setState({
    activeId: 'c1',
    conversations: [
      {
        id: 'c1',
        createdAt: 1,
        messages: [
          { id: 'u1', role: 'user', text: 'book my dentist and nudge me', via: 'voice' },
          {
            id: 'a1',
            role: 'assistant',
            text: 'I can add that.',
            proposals: [{ id: 'p1', summary: 'Add task: Dentist at 15:00', status: 'pending' }],
          },
        ],
      },
    ],
  });
});

describe('Nudge Voice screen', () => {
  it('lets the person confirm what Nudge proposed', async () => {
    await render(<Voice />);
    expect(screen.getByText('Add task: Dentist at 15:00')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Confirm change'));
    await act(async () => undefined);

    expect(confirm).toHaveBeenCalledWith('p1');
    expect(useChatStore.getState().conversations[0].messages[1].proposals?.[0].status).toBe(
      'confirmed'
    );
  });
});
