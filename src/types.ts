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

export type TeamActionResult =
  | { ok: true; teamId?: string }
  | { ok: false; error: string };

export type TeamInviteResult =
  | {
      ok: true;
      teamId?: string;
      invite?: TeamInvite;
      inviteUrl?: string;
      emailSent?: boolean;
      emailError?: string | null;
    }
  | { ok: false; error: string };

export type PasswordResetRequestResult =
  | {
      ok: true;
      resetUrl?: string;
      emailSent?: boolean;
      emailError?: string | null;
    }
  | { ok: false; error: string };

export type SessionPayload = {
  user: PublicUser;
  state: AppState;
  teams: TeamView[];
  invites: TeamInviteView[];
  revision: number;
};

export type ApiAuthResult =
  | { ok: true; session: SessionPayload; created: boolean }
  | { ok: false; error: string };

export type ServerMeta = {
  hasAccounts: boolean;
  smtpConfigured: boolean;
};

export type AuthInput = {
  email: string;
  password: string;
  name?: string;
  mobile?: string;
  countryDial?: string;
};
