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
