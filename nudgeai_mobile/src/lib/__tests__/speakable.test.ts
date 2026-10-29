import { MAX_SPOKEN_CHARS, speakableText, splitForSpeech } from '../speakable';

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

describe('splitForSpeech', () => {
  it('leaves a short reply as one piece', () => {
    expect(splitForSpeech('Done. I added it.')).toEqual(['Done. I added it.']);
    expect(splitForSpeech('')).toEqual([]);
  });

  it('puts the first sentence or two up front so speech can start sooner', () => {
    const text =
      'Done, I added your dentist appointment for tomorrow at 3 pm. ' +
      'I will remind you ten minutes before it starts, and I have also kept your evening free. ' +
      'Anything else you would like me to arrange for the day?';
    const [first, rest] = splitForSpeech(text);
    expect(first).toBe('Done, I added your dentist appointment for tomorrow at 3 pm.');
    expect(rest.startsWith('I will remind you')).toBe(true);
    expect(`${first} ${rest}`).toBe(text); // nothing lost, nothing repeated
  });

  it('does not make a tiny first chunk out of a one-word sentence', () => {
    const text =
      'Done. ' + 'Then here is a second sentence that carries the actual detail. '.repeat(3);
    const [first] = splitForSpeech(text);
    expect(first.length).toBeGreaterThanOrEqual(40);
  });

  it('keeps one piece when there is no sentence end to cut at', () => {
    expect(splitForSpeech('word '.repeat(60).trim())).toHaveLength(1);
  });
});
