import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatInput } from '../components/ChatInput';

const base = { value: '', onChangeText: jest.fn(), onSend: jest.fn(), onVoice: jest.fn() };

describe('ChatInput with a photo waiting', () => {
  it('shows the photo, can be sent with no words, and can drop the photo', async () => {
    const onSend = jest.fn();
    const onRemove = jest.fn();
    await render(
      <ChatInput
        {...base}
        onSend={onSend}
        attachment="file:///a.jpg"
        onRemoveAttachment={onRemove}
      />
    );
    expect(screen.getByLabelText('Attached photo')).toBeTruthy();
    expect(screen.getByPlaceholderText('Add instructions (optional)')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Remove photo'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('is the plain input when there is no photo', async () => {
    await render(<ChatInput {...base} />);
    expect(screen.queryByLabelText('Attached photo')).toBeNull();
    expect(screen.getByLabelText('Start voice mode')).toBeTruthy();
  });
});
