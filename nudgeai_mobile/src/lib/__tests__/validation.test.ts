import { checkPassword, isStrongPassword, isValidEmail } from '../validation';

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('aladexrofiah@gmail.com')).toBe(true);
    expect(isValidEmail('  demo@nudge.ai ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

describe('password rules', () => {
  it('reports each rule independently', () => {
    expect(checkPassword('abc')).toEqual({ minLength: false, uppercase: false, number: false, special: false });
    expect(checkPassword('Abcdefg1!')).toEqual({ minLength: true, uppercase: true, number: true, special: true });
  });

  it('requires every rule', () => {
    expect(isStrongPassword('Password1')).toBe(false);
    expect(isStrongPassword('Password1!')).toBe(true);
  });
});
