import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { startSpeech } from '@/services/speaker';

import { VoicePreview } from '../components/VoicePreview';

jest.mock('@/services/speaker', () => ({ startSpeech: jest.fn() }));

const startSpeechMock = jest.mocked(startSpeech);
const session = { push: jest.fn(), flush: jest.fn(), end: jest.fn(), stop: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  startSpeechMock.mockReturnValue(session);
});

const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => undefined);
};

describe('VoicePreview', () => {
  it('says the sample line aloud, in the chosen tone', async () => {
    await render(<VoicePreview quote="“Ada. Deep work in 10. Let’s go.”" tone="firm" />);
    await press('Play preview');
    expect(startSpeechMock).toHaveBeenCalledTimes(1);
    expect(startSpeechMock.mock.calls[0][0]).toMatchObject({ tone: 'firm' });
    expect(session.push).toHaveBeenCalledWith('“Ada. Deep work in 10. Let’s go.”');
    expect(session.end).toHaveBeenCalled();
    expect(screen.getByLabelText('Stop preview')).toBeTruthy();
  });

  it('returns to "play" when the voice finishes', async () => {
    await render(<VoicePreview quote="Hello" tone="gentle" />);
    await press('Play preview');
    await act(async () => startSpeechMock.mock.calls[0][0]?.onEnd?.());
    expect(screen.getByLabelText('Play preview')).toBeTruthy();
  });

  it('stops when pressed again', async () => {
    await render(<VoicePreview quote="Hello" tone="gentle" />);
    await press('Play preview');
    await press('Stop preview');
    expect(session.stop).toHaveBeenCalled();
    expect(screen.getByLabelText('Play preview')).toBeTruthy();
  });

  it('goes quiet when the user leaves the screen', async () => {
    const { unmount } = await render(<VoicePreview quote="Hello" tone="gentle" />);
    await press('Play preview');
    session.stop.mockClear();
    await unmount();
    expect(session.stop).toHaveBeenCalled();
  });
});
