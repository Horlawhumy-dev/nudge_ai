/** Wire shapes returned by the backend (snake_case, exactly as sent). */

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type ApiUser = {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  is_email_verified: boolean;
  plan: 'free' | 'pro';
  avatar_url: string | null;
  avatar_thumb_url: string | null;
  pending_email: string | null;
  created_at: string;
};

export type ApiOnboarding = {
  name: string | null;
  wake_time: string | null;
  sleep_time: string | null;
  goals: string[];
  nudge_style: string | null;
  completed: boolean;
};

export type MessageResponse = { message: string };
