/** One shape for everything that can go wrong talking to the backend. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status; 0 when the server could not be reached at all. */
    readonly status: number,
    /** Per-input messages from a 422, keyed by field name (`email`, `new_password`, …). */
    readonly fields: Record<string, string> = {},
    /** Seconds to wait before retrying, from a 429's `Retry-After`. */
    readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.status === 0;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  /** The plan's limit was hit (402): show the upgrade prompt instead of an error. */
  get isPlanLimit() {
    return this.status === 402;
  }
  get isRateLimited() {
    return this.status === 429;
  }
}

const OFFLINE = 'Can’t reach Nudge right now. Check your connection and try again.';
const GENERIC = 'Something went wrong. Please try again.';

type Detail = { loc?: unknown[]; msg?: string };

/** FastAPI's `msg` reads "Value error, password needs a number"; keep the useful part. */
function cleanMessage(msg: string): string {
  return msg.replace(/^Value error,\s*/i, '').trim();
}

/** Turn an axios error (or anything thrown) into an ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const e = error as {
    response?: { status: number; data?: unknown; headers?: Record<string, unknown> };
    code?: string;
  };
  if (!e?.response) return new ApiError(OFFLINE, 0);

  const { status, data, headers } = e.response;
  const detail = (data as { detail?: unknown } | undefined)?.detail;
  const retry = Number(headers?.['retry-after']);
  const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : undefined;

  if (Array.isArray(detail)) {
    const fields: Record<string, string> = {};
    for (const item of detail as Detail[]) {
      const key = String(item.loc?.[item.loc.length - 1] ?? 'form');
      fields[key] ??= cleanMessage(item.msg ?? 'Invalid value');
    }
    const first = Object.values(fields)[0] ?? GENERIC;
    return new ApiError(first, status, fields, retryAfter);
  }
  if (typeof detail === 'string' && detail) {
    return new ApiError(detail, status, {}, retryAfter);
  }
  return new ApiError(status >= 500 ? GENERIC : GENERIC, status, {}, retryAfter);
}
