import { act, renderHook, waitFor } from '@testing-library/react-native';

import { speechApi } from '@/services/api/endpoints/speech';
import { startSpeech } from '@/services/speaker';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { useToastStore } from '@/store/useToastStore';

import { useLiveVoiceSession } from '../useLiveVoiceSession';

const mockStream = { start: jest.fn(), stop: jest.fn() };
const speechSession = { push: jest.fn(), flush: jest.fn(), end: jest.fn(), stop: jest.fn() };
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
jest.mock('@/services/speaker', () => ({ startSpeech: jest.fn() }));
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
  jest.mocked(startSpeech).mockReturnValue(speechSession);
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
    expect(mockSend).toHaveBeenCalledWith(
      'push my deep work to 11',
      expect.objectContaining({ via: 'voice' })
    );
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
    await waitFor(() => expect(speechSession.end).toHaveBeenCalled());
    expect(startSpeech).toHaveBeenCalledWith(expect.objectContaining({ tone: 'firm' }));
    // a server that sent no pieces: the whole reply is said once it is in (formatting is stripped later)
    expect(speechSession.push).toHaveBeenCalledWith('Hi **Ada**!');
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
    expect(startSpeech).not.toHaveBeenCalled();
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
    expect(speechSession.stop).toHaveBeenCalled(); // the speech that was opened is cut off...
    expect(speechSession.push).not.toHaveBeenCalledWith('Something went wrong'); // ...unspoken
    expect(speechSession.end).not.toHaveBeenCalled();
  });

  describe('speaking while the reply is still being written', () => {
    /** A chat turn the test controls: pieces are emitted by hand, and the turn ends on demand. */
    function controlledTurn() {
      const turn: {
        emit: (piece: string) => void;
        reset: () => void;
        finish: (text: string) => void;
        ready: Promise<void>;
      } = {} as never;
      turn.ready = new Promise<void>((markReady) => {
        mockSend.mockImplementation(
          (_text: string, options: { onDelta: (p: string) => void; onReset: () => void }) =>
            new Promise((resolve) => {
              turn.emit = options.onDelta;
              turn.reset = options.onReset;
              turn.finish = (text) => resolve({ id: 'r', role: 'assistant', text });
              markReady();
            })
        );
      });
      return turn;
    }

    async function talk() {
      transcribe.mockResolvedValue({ text: 'hello', model: 'm', language: null });
      const rendered = await renderHook(() => useLiveVoiceSession());
      await waitFor(() => expect(rendered.result.current.phase).toBe('listening'));
      await act(async () => mockOnBuffer(oneSecondOfAudio()));
      await act(async () => rendered.result.current.toggleMic());
      return rendered;
    }

    it('hands each piece to the voice as it arrives, before the reply is complete', async () => {
      const turn = controlledTurn();
      const { result } = await talk();
      await turn.ready;
      expect(result.current.phase).toBe('generating');

      turn.emit('Okay, I added it. ');
      turn.emit('I will remind you');
      expect(speechSession.push.mock.calls.map((c) => c[0])).toEqual([
        'Okay, I added it. ',
        'I will remind you',
      ]);
      expect(speechSession.end).not.toHaveBeenCalled(); // still being written

      await act(async () => turn.finish('Okay, I added it. I will remind you before.'));
      await waitFor(() => expect(speechSession.end).toHaveBeenCalledTimes(1));
      // the pieces already carried the reply, so it is not said a second time
      expect(speechSession.push).toHaveBeenCalledTimes(2);
    });

    it('says a lead-in like "Let me check." before the real answer replaces it', async () => {
      const turn = controlledTurn();
      await talk();
      await turn.ready;
      turn.emit('Let me check.');
      turn.reset();
      expect(speechSession.flush).toHaveBeenCalledTimes(1);
      turn.emit('You are free all day.');
      await act(async () => turn.finish('You are free all day.'));
      await waitFor(() => expect(speechSession.end).toHaveBeenCalled());
      expect(speechSession.push.mock.calls.map((c) => c[0])).toEqual([
        'Let me check.',
        'You are free all day.',
      ]);
    });
  });
});
