import { deliveryFor, spokenText } from '../voice';

describe('spokenText', () => {
  it('drops the quotation marks around the sample line', () => {
    expect(spokenText('“Hey Ada, ready when you are.”')).toBe('Hey Ada, ready when you are.');
  });

  it('turns a spaced dash into a pause', () => {
    expect(spokenText('“Hey Ada, you’re on a roll - keep it going!”')).toBe(
      'Hey Ada, you’re on a roll, keep it going!'
    );
  });

  it('keeps hyphens inside words', () => {
    expect(spokenText('A 7-day streak, well-done')).toBe('A 7-day streak, well-done');
  });
});

describe('deliveryFor', () => {
  it('makes gentle slower and warmer, and firm quicker and lower', () => {
    const gentle = deliveryFor('gentle');
    const firm = deliveryFor('firm');
    expect(gentle.rate).toBeLessThan(1);
    expect(gentle.pitch).toBeGreaterThan(1);
    expect(firm.rate).toBeGreaterThan(1);
    expect(firm.pitch).toBeLessThan(1);
    expect(deliveryFor('mix')).toEqual({ rate: 1, pitch: 1 });
  });
});
