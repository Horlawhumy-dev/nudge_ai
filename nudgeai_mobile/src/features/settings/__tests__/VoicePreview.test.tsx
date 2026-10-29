import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { speak } from '@/services/speaker';

import { VoicePreview } from '../components/VoicePreview';

jest.mock('@/services/speaker', () => ({ speak: jest.fn() }));

const speakMock = jest.mocked(speak);
const handle = { stop: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  speakMock.mockResolvedValue(handle);
});

const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => undefined); // let the speak() promise settle
};

describe('VoicePreview', () => {
  it('says the sample line aloud, in the chosen tone', async () => {
    await render(<VoicePreview quote="“Ada. Deep work in 10. Let’s go.”" tone="firm" />);
    await press('Play preview');
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(speakMock.mock.calls[0][0]).toBe('“Ada. Deep work in 10. Let’s go.”');
    expect(speakMock.mock.calls[0][1]).toMatchObject({ tone: 'firm' });
    expect(screen.getByLabelText('Stop preview')).toBeTruthy();
  });

  it('returns to "play" when the voice finishes', async () => {
    await render(<VoicePreview quote="Hello" tone="gentle" />);
    await press('Play preview');
    await act(async () => speakMock.mock.calls[0][1]?.onEnd?.());
    expect(screen.getByLabelText('Play preview')).toBeTruthy();
  });

  it('stops when pressed again', async () => {
    await render(<VoicePreview quote="Hello" tone="gentle" />);
    await press('Play preview');
    await press('Stop preview');
    expect(handle.stop).toHaveBeenCalled();
    expect(screen.getByLabelText('Play preview')).toBeTruthy();
  });

  it('goes quiet when the user leaves the screen', async () => {
    const { unmount } = await render(<VoicePreview quote="Hello" tone="gentle" />);
    await press('Play preview');
    handle.stop.mockClear();
    await unmount();
    expect(handle.stop).toHaveBeenCalled();
  });
});
