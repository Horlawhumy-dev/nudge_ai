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

export type ApiHabit = {
  id: string;
  name: string;
  emoji: string;
  category: string | null;
  time_of_day: string;
  frequency: string;
  goal_days: number;
  stacked_after_id: string | null;
  active: boolean;
  done_today: boolean;
  done_last_7d: number;
  streak: { current: number; best: number } | null;
};

export type ApiCompletions = { start: string; end: string; days: Record<string, string[]> };

export type ApiTask = {
  id: string;
  title: string;
  notes: string | null;
  priority: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  repeat: boolean;
  repeat_rule: string | null;
  done: boolean;
  status: 'upcoming' | 'overdue' | 'completed';
};
