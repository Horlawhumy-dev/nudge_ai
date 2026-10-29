import { MAX_SPOKEN_CHARS, speakableText } from '../speakable';

describe('speakableText', () => {
  it('reads formatting as words, not symbols', () => {
    expect(speakableText('Do **deep work** at 10:\n- Read\n- Stretch')).toBe(
      'Do deep work at 10: Read Stretch'
    );
  });

  it('leaves a short reply alone', () => {
    expect(speakableText('Done. See you tomorrow!')).toBe('Done. See you tomorrow!');
  });

  it('cuts a long reply at a sentence end', () => {
    const sentence = 'This is one fairly ordinary sentence of text. ';
    const text = sentence.repeat(20);
    const spoken = speakableText(text);
    expect(spoken.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
    expect(spoken.endsWith('.')).toBe(true);
    expect(text.startsWith(spoken)).toBe(true);
  });

  it('cuts at a word when there is no sentence end to use', () => {
    const spoken = speakableText('word '.repeat(200), 50);
    expect(spoken.length).toBeLessThanOrEqual(50);
    expect(spoken.endsWith('word')).toBe(true);
  });

  it('copes with empty replies', () => {
    expect(speakableText('')).toBe('');
    expect(speakableText('   \n ')).toBe('');
  });
});
