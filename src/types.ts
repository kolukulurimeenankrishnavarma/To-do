/** Shared success-or-error shape for API and form actions. */
export type Result<T extends object = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type ProgressEntry = {
  value: number;
  at: number;
  note: string;
  /** Member who wrote the entry; absent on older records and completions. */
  by?: string | null;
};

export type Task = {
  id: string;
  title: string;
  createdAt: number;
  deadline: number | null;
  assigneeId: string | null;
  progress: number;
  progressLog: ProgressEntry[];
};

export type CompletedTask = Task & {
  completedAt: number;
};

export type AppState = {
  tasks: Task[];
  history: CompletedTask[];
};

export type TaskFilter = "all" | "pending" | "overdue" | "completed";

export type TaskSort =
  | "newest"
  | "deadline"
  | "progress-desc"
  | "progress-asc"
  | "title";

/** One answer to a rotating, non-repeating mood question. */
export type MoodAnswer = {
  id: string;
  prompt: string;
  value: number;
};

/** A private daily snapshot used only by the rule engine. */
export type CheckIn = {
  /** Local calendar day in YYYY-MM-DD form. */
  day: string;
  /** Direct 1–5 answer. */
  energy: number;
  /** Average of the mood answers, 1–5. */
  mood: number;
  /** Minutes the user says they have available. */
  timeWindow: number;
  answers: MoodAnswer[];
  createdAt: number;
};

export type Insights = {
  version: number;
  checkIn: CheckIn | null;
  /** Last day the daily prompt was shown or skipped. */
  lastPromptDay: string | null;
  updatedAt: number;
};

export type DeadlineInfo = {
  text: string;
  className: string;
};

export type Workspace = "private" | "team";

export type AuthMode = "signin" | "signup";

/**
 * The server never sends password material or lookup keys to the browser, so
 * the UI works with this reduced profile.
 */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  createdAt: number;
};

export type TeamRole = "host" | "member";

export type TeamMember = {
  userId: string;
  role: TeamRole;
  joinedAt: number;
};

export type TeamInviteStatus = "pending" | "accepted" | "declined";

export type TeamInvite = {
  id: string;
  email: string;
  emailKey: string;
  invitedByUserId: string;
  createdAt: number;
  status: TeamInviteStatus;
  respondedAt: number | null;
  acceptedByUserId: string | null;
};

export type Team = {
  id: string;
  name: string;
  hostId: string;
  createdAt: number;
  members: TeamMember[];
  invites: TeamInvite[];
  state: AppState;
};

export type TeamView = {
  team: Team;
  host: PublicUser | null;
  members: PublicUser[];
  isHost: boolean;
  pendingInvites: TeamInvite[];
};

export type TeamInviteView = {
  team: Team;
  host: PublicUser | null;
  invite: TeamInvite;
};

export type TeamActionResult = Result<{ teamId?: string }>;

export type TeamInviteResult = Result<{
  teamId?: string;
  invite?: TeamInvite;
  inviteUrl?: string;
  emailSent?: boolean;
  emailError?: string | null;
}>;

export type PasswordResetRequestResult = Result<{
  resetUrl?: string;
  emailSent?: boolean;
  emailError?: string | null;
}>;

export type SessionPayload = {
  user: PublicUser;
  state: AppState;
  teams: TeamView[];
  invites: TeamInviteView[];
  revision: number;
  insights: Insights;
};

export type ApiAuthResult = Result<{
  session: SessionPayload;
  created: boolean;
}>;

export type ServerMeta = {
  hasAccounts: boolean;
  smtpConfigured: boolean;
};

export type EmailCheckResponse = {
  valid: boolean;
  exists: boolean;
};

export type AuthInput = {
  email: string;
  password: string;
  name?: string;
  mobile?: string;
  countryDial?: string;
};
