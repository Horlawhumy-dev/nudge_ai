import { act, renderHook, waitFor } from '@testing-library/react-native';

import { speechApi } from '@/services/api/endpoints/speech';
import { speak } from '@/services/speaker';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { useToastStore } from '@/store/useToastStore';

import { useLiveVoiceSession } from '../useLiveVoiceSession';

const mockStream = { start: jest.fn(), stop: jest.fn() };
const mockSend = jest.fn();
let mockOnBuffer: (b: { data: ArrayBuffer; sampleRate: number; channels: number }) => void;

jest.mock('expo-audio', () => ({
  useAudioStream: (opts: { onBuffer: typeof mockOnBuffer }) => {
    mockOnBuffer = opts.onBuffer;
    return { stream: mockStream, isStreaming: false };
  },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
jest.mock('@/services/api/endpoints/speech');
jest.mock('@/services/speaker', () => ({ speak: jest.fn() }));
jest.mock('@/store/useChatStore', () => ({
  useChatStore: (select: (s: { send: typeof mockSend }) => unknown) => select({ send: mockSend }),
}));

const transcribe = jest.mocked(speechApi.transcribe);
const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));
const oneSecondOfAudio = () => ({
  data: new Int16Array(16000).fill(500).buffer,
  sampleRate: 16000,
  channels: 1,
});

beforeEach(() => {
  jest.resetAllMocks();
  const audio = jest.requireMock('expo-audio');
  audio.requestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
  audio.setAudioModeAsync.mockResolvedValue(undefined);
  mockStream.start.mockResolvedValue(undefined);
  mockSend.mockResolvedValue(null);
  jest.mocked(speak).mockResolvedValue({ stop: jest.fn() });
  usePreferencesStore.getState().reset();
  useToastStore.setState({ current: null });
});

describe('live voice session', () => {
  it('does not crash when the stream was already released by the time we stop it', async () => {
    // exactly the failure seen on a phone: "Cannot use shared object that was already released"
    mockStream.stop.mockImplementation(() => {
      throw new Error('Cannot use shared object that was already released');
    });
    const { unmount } = await renderHook(() => useLiveVoiceSession());
    await settle();
    await expect(unmount()).resolves.not.toThrow();
    expect(mockStream.stop).toHaveBeenCalled();
  });

  it('records, sends the audio as WAV, and passes the words to chat as a voice message', async () => {
    transcribe.mockResolvedValue({ text: 'push my deep work to 11', model: 'm', language: null });
    const { result } = await renderHook(() => useLiveVoiceSession());
    await waitFor(() => expect(result.current.phase).toBe('listening'));

    await act(async () => mockOnBuffer(oneSecondOfAudio()));
    await act(async () => result.current.toggleMic());
    await waitFor(() => expect(result.current.phase).toBe('idle'));

    const wav = transcribe.mock.calls[0][0];
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(mockSend).toHaveBeenCalledWith('push my deep work to 11', { via: 'voice' });
    expect(result.current.phase).toBe('idle');
    expect(result.current.transcript.heard).toBe('push my deep work to 11');
  });

  it('treats a stray tap (almost no audio) as nothing said, without calling the server', async () => {
    const { result } = await renderHook(() => useLiveVoiceSession());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    await act(async () => result.current.toggleMic());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(transcribe).not.toHaveBeenCalled();
    expect(useToastStore.getState().current?.message).toMatch(/didn’t catch/);
  });

  it('shows why transcription failed and lets the user try again', async () => {
    const { ApiError } = jest.requireActual('@/services/api/errors');
    transcribe.mockRejectedValue(new ApiError('send mono 16-bit WAV audio (16 or 24 kHz)', 415));
    const { result } = await renderHook(() => useLiveVoiceSession());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    await act(async () => mockOnBuffer(oneSecondOfAudio()));
    await act(async () => result.current.toggleMic());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(useToastStore.getState().current).toMatchObject({ tone: 'error' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('says nothing and sends nothing if the screen was closed while transcribing', async () => {
    let finishTranscribing!: (v: { text: string; model: string; language: null }) => void;
    transcribe.mockReturnValue(new Promise((r) => (finishTranscribing = r)));
    const { result, unmount } = await renderHook(() => useLiveVoiceSession());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    await act(async () => mockOnBuffer(oneSecondOfAudio()));
    await act(async () => result.current.toggleMic());
    await unmount();
    await act(async () => finishTranscribing({ text: 'too late', model: 'm', language: null }));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('reads Nudge’s reply aloud, in the chosen tone', async () => {
    transcribe.mockResolvedValue({ text: 'hello', model: 'm', language: null });
    mockSend.mockResolvedValue({ id: 'r1', role: 'assistant', text: 'Hi **Ada**!' });
    usePreferencesStore.getState().set({ tone: 'firm' });
    const { result } = await renderHook(() => useLiveVoiceSession());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    await act(async () => mockOnBuffer(oneSecondOfAudio()));
    await act(async () => result.current.toggleMic());
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect(jest.mocked(speak).mock.calls[0][0]).toBe('Hi **Ada**!'); // formatting is stripped later
    expect(jest.mocked(speak).mock.calls[0][1]).toMatchObject({ tone: 'firm' });
  });

  it('stays silent when voice replies are switched off in settings', async () => {
    transcribe.mockResolvedValue({ text: 'hello', model: 'm', language: null });
    mockSend.mockResolvedValue({ id: 'r1', role: 'assistant', text: 'Hi Ada' });
    usePreferencesStore.getState().setNotification('voice', false);
    const { result } = await renderHook(() => useLiveVoiceSession());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    await act(async () => mockOnBuffer(oneSecondOfAudio()));
    await act(async () => result.current.toggleMic());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(speak).not.toHaveBeenCalled();
    // and it says why, instead of leaving the person wondering
    expect(useToastStore.getState().current?.message).toMatch(/Spoken replies are off/);
  });

  it('does not read out an error message', async () => {
    transcribe.mockResolvedValue({ text: 'hello', model: 'm', language: null });
    mockSend.mockResolvedValue({
      id: 'r1',
      role: 'assistant',
      text: 'Something went wrong',
      failed: true,
    });
    const { result } = await renderHook(() => useLiveVoiceSession());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    await act(async () => mockOnBuffer(oneSecondOfAudio()));
    await act(async () => result.current.toggleMic());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(speak).not.toHaveBeenCalled();
  });
});
