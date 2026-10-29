export type ChatRole = 'user' | 'assistant';
export type ChatVia = 'text' | 'voice';

/** A change the assistant wants to make; nothing happens until the user confirms it. */
export type ProposalStatus = 'pending' | 'working' | 'confirmed' | 'rejected' | 'failed';
export type Proposal = {
  id: string;
  /** Plain-language description, e.g. "Change “Deep work”: start time 11:00". */
  summary: string;
  status: ProposalStatus;
  /** Why it failed, when it did (e.g. a plan limit). */
  error?: string;
  /** What kind of change it is, e.g. `task_create`. */
  tool?: string;
  /** The assistant's proposed values; for a task: title, date, start_time, end_time, priority. */
  args?: Record<string, unknown>;
  /** The person has seen and approved the day and time (or edited them). */
  whenConfirmed?: boolean;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  via?: ChatVia;
  /** Set on the first message when it came from a quick prompt chip. */
  promptEmoji?: string;
  /** Changes the assistant proposed in this reply. */
  proposals?: Proposal[];
  /** The assistant could not answer; the bubble offers "Try again". */
  failed?: boolean;
  /** Server trace of how this reply was produced. */
  traceId?: string;
};

export type ConversationMode = 'Text' | 'Voice' | 'Voice + text';

export type Conversation = {
  id: string;
  /** The backend's id once the conversation exists there. */
  serverId?: string;
  /** The server's title; without one it's derived from the first message. */
  title?: string;
  /** Epoch ms of the first message; drives grouping and the time shown in history. */
  createdAt: number;
  messages: ChatMessage[];
};

export type QuickPrompt = { id: string; emoji: string; label: string };
