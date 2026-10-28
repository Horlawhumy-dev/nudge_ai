import { ApiError, toApiError } from '../errors';

const http = (status: number, data?: unknown, headers: Record<string, unknown> = {}) => ({
  response: { status, data, headers },
});

describe('toApiError', () => {
  it('uses the FastAPI detail string', () => {
    const e = toApiError(http(409, { detail: 'email already registered' }));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe('email already registered');
    expect(e.status).toBe(409);
  });

  it('maps a 422 list to per-field messages and cleans pydantic prefixes', () => {
    const e = toApiError(
      http(422, {
        detail: [
          { loc: ['body', 'new_password'], msg: 'Value error, password needs a number' },
          { loc: ['body', 'email'], msg: 'value is not a valid email address' },
          { loc: ['body', 'email'], msg: 'second message is ignored' },
        ],
      })
    );
    expect(e.fields).toEqual({
      new_password: 'password needs a number',
      email: 'value is not a valid email address',
    });
    expect(e.message).toBe('password needs a number');
  });

  it('treats a missing response as being offline', () => {
    const e = toApiError(new Error('Network Error'));
    expect(e.isNetwork).toBe(true);
    expect(e.message).toMatch(/connection/);
  });

  it('exposes the plan limit and the retry delay', () => {
    expect(toApiError(http(402, { detail: 'Free includes 3 habits' })).isPlanLimit).toBe(true);
    const limited = toApiError(http(429, { detail: 'slow down' }, { 'retry-after': '42' }));
    expect(limited.isRateLimited).toBe(true);
    expect(limited.retryAfter).toBe(42);
  });

  it('falls back to a friendly message for opaque server errors', () => {
    expect(toApiError(http(500, '<html>oops</html>')).message).toMatch(/try again/i);
  });

  it('passes an ApiError through unchanged', () => {
    const original = new ApiError('x', 400);
    expect(toApiError(original)).toBe(original);
  });
});
