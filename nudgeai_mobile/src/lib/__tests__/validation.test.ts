import {
  checkPassword,
  isStrongPassword,
  isValidEmail,
  validateConfirmPassword,
  validateEmail,
  validateFeedback,
  validateFullName,
  validateHabitName,
  validateNewPassword,
  validateNickname,
  validateOtp,
  validatePasswordPresent,
  validateTaskTitle,
} from '../validation';

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
    expect(checkPassword('abc')).toEqual({
      minLength: false,
      uppercase: false,
      number: false,
      special: false,
    });
    expect(checkPassword('Abcdefg1!')).toEqual({
      minLength: true,
      uppercase: true,
      number: true,
      special: true,
    });
  });

  it('requires every rule', () => {
    expect(isStrongPassword('Password1')).toBe(false);
    expect(isStrongPassword('Password1!')).toBe(true);
  });
});

describe('field validators', () => {
  it('distinguishes empty from malformed emails', () => {
    expect(validateEmail('')).toMatch(/Enter your email/);
    expect(validateEmail('nope')).toMatch(/valid email/);
    expect(validateEmail('a@b.co')).toBeNull();
  });

  it('validates full names', () => {
    expect(validateFullName('')).toMatch(/Enter your full name/);
    expect(validateFullName('A')).toMatch(/2 characters/);
    expect(validateFullName('x'.repeat(51))).toMatch(/under 50/);
    expect(validateFullName('R0phy')).toMatch(/letters only/);
    expect(validateFullName('Rophy Alade')).toBeNull();
    expect(validateFullName("Mary-Jane O'Neil")).toBeNull();
    expect(validateFullName('Zoë Ñandú')).toBeNull();
  });

  it('validates nicknames', () => {
    expect(validateNickname('  ')).toMatch(/like to be called/);
    expect(validateNickname('x'.repeat(21))).toMatch(/under 20/);
    expect(validateNickname('Rophy')).toBeNull();
  });

  it('names the first unmet password rule, in order', () => {
    expect(validateNewPassword('')).toMatch(/Create a password/);
    expect(validateNewPassword('Ab1!')).toMatch(/8 characters/);
    expect(validateNewPassword('password1!')).toMatch(/capital/);
    expect(validateNewPassword('Password!!')).toMatch(/number/);
    expect(validateNewPassword('Password11')).toMatch(/special/);
    expect(validateNewPassword('Password1!')).toBeNull();
    expect(validatePasswordPresent('')).toMatch(/Enter your password/);
    expect(validatePasswordPresent('x')).toBeNull();
  });

  it('checks password confirmation', () => {
    expect(validateConfirmPassword('Password1!', '')).toMatch(/Confirm/);
    expect(validateConfirmPassword('Password1!', 'Password1')).toMatch(/don’t match/);
    expect(validateConfirmPassword('Password1!', 'Password1!')).toBeNull();
  });

  it('checks one-time codes', () => {
    expect(validateOtp('12', 4)).toMatch(/4-digit/);
    expect(validateOtp('12a4', 4)).toMatch(/numbers only/);
    expect(validateOtp('1234', 4)).toBeNull();
  });

  it('rejects blank, long and duplicate habit names', () => {
    expect(validateHabitName('  ')).toMatch(/name/);
    expect(validateHabitName('x'.repeat(41))).toMatch(/under 40/);
    expect(validateHabitName('  drink   WATER ', ['Drink Water'])).toMatch(/already/);
    expect(validateHabitName('Stretch', ['Drink Water'])).toBeNull();
  });

  it('validates task titles and feedback length', () => {
    expect(validateTaskTitle('')).toMatch(/name/);
    expect(validateTaskTitle('x'.repeat(81))).toMatch(/under 80/);
    expect(validateTaskTitle('Plan sprint')).toBeNull();
    expect(validateFeedback('')).toMatch(/Tell us/);
    expect(validateFeedback('short')).toMatch(/5 more characters/);
    expect(validateFeedback('123456789')).toMatch(/1 more character\b/);
    expect(validateFeedback('long enough text')).toBeNull();
  });
});
