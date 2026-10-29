import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Speech from 'expo-speech';

import { VoicePreview } from '../components/VoicePreview';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => undefined) }));

const speak = jest.mocked(Speech.speak);
const stop = jest.mocked(Speech.stop);

beforeEach(() => jest.clearAllMocks());

describe('VoicePreview', () => {
  it('says the sample line aloud, in the tone’s delivery', async () => {
    await render(<VoicePreview quote="“Ada. Deep work in 10. Let’s go.”" tone="firm" />);
    await fireEvent.press(screen.getByLabelText('Play preview'));
    expect(speak).toHaveBeenCalledTimes(1);
    const [text, options] = speak.mock.calls[0];
    expect(text).toBe('Ada. Deep work in 10. Let’s go.');
    expect(options).toMatchObject({ rate: expect.any(Number), pitch: expect.any(Number) });
    expect(options?.rate).toBeGreaterThan(1); // firm is brisk
    expect(screen.getByLabelText('Stop preview')).toBeTruthy();
  });

  it('returns to "play" when the voice finishes', async () => {
    await render(<VoicePreview quote="Hello" tone="gentle" />);
    await fireEvent.press(screen.getByLabelText('Play preview'));
    await act(async () => speak.mock.calls[0][1]?.onDone?.());
    expect(screen.getByLabelText('Play preview')).toBeTruthy();
  });

  it('stops when pressed again', async () => {
    await render(<VoicePreview quote="Hello" tone="gentle" />);
    await fireEvent.press(screen.getByLabelText('Play preview'));
    await fireEvent.press(screen.getByLabelText('Stop preview'));
    expect(stop).toHaveBeenCalled();
    expect(screen.getByLabelText('Play preview')).toBeTruthy();
  });

  it('goes quiet when the user leaves the screen', async () => {
    const { unmount } = await render(<VoicePreview quote="Hello" tone="gentle" />);
    await fireEvent.press(screen.getByLabelText('Play preview'));
    stop.mockClear();
    await unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('does not stay stuck "playing" if the voice fails', async () => {
    await render(<VoicePreview quote="Hello" tone="gentle" />);
    await fireEvent.press(screen.getByLabelText('Play preview'));
    await act(async () => speak.mock.calls[0][1]?.onError?.(new Error('no voice installed')));
    expect(screen.getByLabelText('Play preview')).toBeTruthy();
  });
});
