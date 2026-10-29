import { act, renderHook, waitFor } from '@testing-library/react-native';

import { speechApi } from '@/services/api/endpoints/speech';
import { openLiveTranscription, type LiveCallbacks } from '@/services/liveTranscribe';
import { startSpeech } from '@/services/speaker';
import { usePreferencesStore } from '@/store/usePreferencesStore';

import { liveWait, useLiveVoiceSession } from '../useLiveVoiceSession';

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
jest.mock('@/services/speaker', () => ({ startSpeech: jest.fn() }));
jest.mock('@/services/liveTranscribe', () => ({ openLiveTranscription: jest.fn() }));
jest.mock('@/store/useChatStore', () => ({
  useChatStore: (select: (s: { send: typeof mockSend }) => unknown) => select({ send: mockSend }),
}));

const open = jest.mocked(openLiveTranscription);
const transcribe = jest.mocked(speechApi.transcribe);

const session = { sendAudio: jest.fn(), stop: jest.fn(), close: jest.fn() };
const speechSession = { push: jest.fn(), flush: jest.fn(), end: jest.fn(), stop: jest.fn() };
const callbacks = (): LiveCallbacks => open.mock.calls[open.mock.calls.length - 1][0];
const audio = (samples = 16_000, rate = 16_000, channels = 1) => ({
  data: new Int16Array(samples).fill(500).buffer,
  sampleRate: rate,
  channels,
});

/** Mount the hook and wait until it is listening with a live session open. */
async function listening() {
  const rendered = await renderHook(() => useLiveVoiceSession());
  await waitFor(() => expect(rendered.result.current.phase).toBe('listening'));
  return rendered;
}

beforeEach(() => {
  jest.resetAllMocks();
  const audioModule = jest.requireMock('expo-audio');
  audioModule.requestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
  audioModule.setAudioModeAsync.mockResolvedValue(undefined);
  mockStream.start.mockResolvedValue(undefined);
  mockSend.mockResolvedValue({ id: 'r', role: 'assistant', text: 'Done, added.' });
  jest.mocked(startSpeech).mockReturnValue(speechSession);
  open.mockReturnValue(session);
  usePreferencesStore.getState().reset();
  liveWait.heardMs = 40;
  liveWait.silentMs = 20;
});

describe('live voice session', () => {
  it('opens the live connection before the microphone is up, so the two start together', async () => {
    await listening();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(
      mockStream.start.mock.invocationCallOrder[0]
    );
  });

  it('streams the microphone to the live session and keeps its own copy', async () => {
    await listening();
    await act(async () => mockOnBuffer(audio(1280)));
    expect(session.sendAudio).toHaveBeenCalledTimes(1);
    expect(session.sendAudio.mock.calls[0][0]).toHaveLength(1280);
  });

  it('converts audio the phone delivers at another rate or in stereo', async () => {
    await listening();
    await act(async () => mockOnBuffer(audio(48_000 * 2, 48_000, 2))); // 1 s of 48 kHz stereo
    expect(session.sendAudio.mock.calls[0][0]).toHaveLength(16_000); // 1 s of 16 kHz mono
  });

  it('shows the words as they are heard', async () => {
    const { result } = await listening();
    await act(async () => callbacks().onPartial('push my deep'));
    expect(result.current.transcript.heard).toBe('push my deep');
    await act(async () => callbacks().onPartial('push my deep work to 11'));
    expect(result.current.transcript.heard).toBe('push my deep work to 11');
  });

  it('sends the sentence on its own when the model hears it end, with no tap and no upload', async () => {
    const { result } = await listening();
    await act(async () => mockOnBuffer(audio()));
    await act(async () => callbacks().onTurn('push my deep work to 11 am please'));
    await waitFor(() => expect(result.current.phase).toBe('idle'));

    expect(mockSend).toHaveBeenCalledWith(
      'push my deep work to 11 am please',
      expect.objectContaining({ via: 'voice' })
    );
    expect(transcribe).not.toHaveBeenCalled(); // nothing was uploaded
    expect(mockStream.stop).toHaveBeenCalled(); // the microphone is off
    expect(session.close).toHaveBeenCalled();
    expect(speechSession.push).toHaveBeenCalledWith('Done, added.'); // and it answers aloud
    expect(speechSession.end).toHaveBeenCalled();
  });

  it('ignores a "sentence" that is only noise and keeps listening', async () => {
    const { result } = await listening();
    await act(async () => callbacks().onTurn('...'));
    await act(async () => callbacks().onTurn('  '));
    expect(mockSend).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('listening');
  });

  it('on a tap to stop, asks the live session to finish and uses its sentence', async () => {
    const { result } = await listening();
    await act(async () => mockOnBuffer(audio()));
    await act(async () => result.current.toggleMic());
    expect(session.stop).toHaveBeenCalled();
    await act(async () => callbacks().onTurn('buy milk'));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(mockSend).toHaveBeenCalledWith('buy milk', expect.objectContaining({ via: 'voice' }));
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('falls back to uploading the recording if live never answers a tap to stop', async () => {
    transcribe.mockResolvedValue({ text: 'uploaded words', model: 'm', language: null });
    const { result } = await listening();
    await act(async () => callbacks().onPartial('hello')); // it heard something, so it waits longer
    await act(async () => mockOnBuffer(audio()));
    await act(async () => result.current.toggleMic());
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith(
        'uploaded words',
        expect.objectContaining({ via: 'voice' })
      )
    );
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it('uploads straight away when live has already failed', async () => {
    transcribe.mockResolvedValue({ text: 'uploaded words', model: 'm', language: null });
    const { result } = await listening();
    await act(async () => mockOnBuffer(audio()));
    await act(async () => callbacks().onFail('closed'));
    await act(async () => result.current.toggleMic());
    expect(session.stop).not.toHaveBeenCalled(); // no live session to ask
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith(
        'uploaded words',
        expect.objectContaining({ via: 'voice' })
      )
    );
  });

  it('uploads when live is not available at all (demo mode or no login)', async () => {
    open.mockReturnValue(null);
    transcribe.mockResolvedValue({ text: 'uploaded words', model: 'm', language: null });
    const { result } = await listening();
    await act(async () => mockOnBuffer(audio()));
    await act(async () => result.current.toggleMic());
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith(
        'uploaded words',
        expect.objectContaining({ via: 'voice' })
      )
    );
  });

  it('hangs up the live connection when the screen closes', async () => {
    const { unmount } = await listening();
    await unmount();
    expect(session.close).toHaveBeenCalled();
    expect(mockStream.stop).toHaveBeenCalled();
  });

  it('opens a fresh live session each time the person talks again', async () => {
    const { result } = await listening();
    await act(async () => callbacks().onTurn('first thing'));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    await act(async () => result.current.toggleMic()); // talk again
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    expect(open).toHaveBeenCalledTimes(2);
  });
});
