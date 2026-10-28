const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export type PasswordCheck = {
  minLength: boolean;
  uppercase: boolean;
  number: boolean;
  special: boolean;
};

/** Rule set from the "Create new password" design: 8+ chars, a capital, a number, a special char. */
export function checkPassword(value: string): PasswordCheck {
  return {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
}

export function isStrongPassword(value: string): boolean {
  return Object.values(checkPassword(value)).every(Boolean);
}

/* ------------------------------------------------------------------------------------------------
 * Field validators. Each returns a friendly error message, or null when the value is acceptable.
 * Screens decide *when* to show them (after blur or submit); these only decide *what* is wrong.
 * ---------------------------------------------------------------------------------------------- */

export type FieldError = string | null;

export function validateEmail(value: string): FieldError {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (!isValidEmail(v)) return 'Enter a valid email address, like name@example.com.';
  return null;
}

const NAME_CHARS = /^[\p{L}][\p{L}\s'.-]*$/u;

export function validateFullName(value: string): FieldError {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return 'Enter your full name.';
  if (v.length < 2) return 'Your name needs at least 2 characters.';
  if (v.length > 50) return 'Keep your name under 50 characters.';
  if (!NAME_CHARS.test(v)) return 'Use letters only. Spaces, hyphens and apostrophes are fine.';
  return null;
}

/** What reminders call you: a single short name. */
export function validateNickname(value: string): FieldError {
  const v = value.trim();
  if (!v) return 'Enter the name you’d like to be called.';
  if (v.length > 20) return 'Keep it under 20 characters.';
  if (!NAME_CHARS.test(v)) return 'Use letters only.';
  return null;
}

/** For logging in: we don't judge strength, only that something was entered. */
export function validatePasswordPresent(value: string): FieldError {
  return value ? null : 'Enter your password.';
}

const RULE_MESSAGES: Record<keyof PasswordCheck, string> = {
  minLength: 'Use at least 8 characters.',
  uppercase: 'Add a capital letter.',
  number: 'Add a number.',
  special: 'Add a special character, like ! or #.',
};

/** For choosing a password: names the first unmet rule. */
export function validateNewPassword(value: string): FieldError {
  if (!value) return 'Create a password.';
  const result = checkPassword(value);
  const missing = (Object.keys(RULE_MESSAGES) as (keyof PasswordCheck)[]).find((k) => !result[k]);
  return missing ? RULE_MESSAGES[missing] : null;
}

export function validateConfirmPassword(password: string, confirm: string): FieldError {
  if (!confirm) return 'Confirm your password.';
  if (confirm !== password) return 'Passwords don’t match.';
  return null;
}

export function validateOtp(code: string, length: number): FieldError {
  if (code.length < length) return `Enter the ${length}-digit code.`;
  return /^\d+$/.test(code) ? null : 'The code is numbers only.';
}

export const HABIT_NAME_MAX = 40;

/** `existing` are other habits' names; matching is case-insensitive and ignores extra spaces. */
export function validateHabitName(value: string, existing: readonly string[] = []): FieldError {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return 'Give your habit a name.';
  if (v.length > HABIT_NAME_MAX) return `Keep it under ${HABIT_NAME_MAX} characters.`;
  const key = v.toLowerCase();
  if (existing.some((n) => n.trim().replace(/\s+/g, ' ').toLowerCase() === key)) {
    return 'You already have a habit with this name.';
  }
  return null;
}

export const TASK_TITLE_MAX = 80;

export function validateTaskTitle(value: string): FieldError {
  const v = value.trim();
  if (!v) return 'Give your task a name.';
  if (v.length > TASK_TITLE_MAX) return `Keep it under ${TASK_TITLE_MAX} characters.`;
  return null;
}

export const FEEDBACK_MIN = 10;

export function validateFeedback(value: string, min: number = FEEDBACK_MIN): FieldError {
  const length = value.trim().length;
  if (length === 0) return 'Tell us a little about it.';
  if (length < min) {
    const more = min - length;
    return `Add ${more} more character${more === 1 ? '' : 's'} so we can help.`;
  }
  return null;
}
