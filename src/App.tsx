import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { TasklyBoard } from "./components/TasklyBoard";
import { ThemeToggle } from "./components/ThemeToggle";
import {
  acceptTeamInvite,
  authenticate,
  cancelTeamInvite,
  completePasswordReset,
  createTeam,
  declineTeamInvite,
  deleteTeam,
  errorMessage,
  eventsUrl,
  getMeta,
  getSession,
  inviteTeamMember,
  logout,
  removeTeamMember,
  requestPasswordReset,
} from "./lib/api";
import {
  applyTheme,
  initialTheme,
  rememberTheme,
  watchSystemTheme,
  type Theme,
} from "./lib/theme";
import type {
  ApiAuthResult,
  AuthInput,
  PasswordResetRequestResult,
  ServerMeta,
  SessionPayload,
  TeamActionResult,
  TeamInviteResult,
} from "./types";

function inviteIdFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("invite");
  } catch {
    return null;
  }
}

function resetTokenFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("reset");
  } catch {
    return null;
  }
}

export default function App() {
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  const [bootError, setBootError] = useState("");
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [focusInviteId] = useState<string | null>(inviteIdFromUrl);
  const [resetToken, setResetToken] = useState<string | null>(resetTokenFromUrl);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => watchSystemTheme(setTheme), []);

  function handleToggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      rememberTheme(next);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const [serverMeta, activeSession] = await Promise.all([
          getMeta(),
          getSession(),
        ]);
        if (cancelled) return;
        setMeta(serverMeta);
        setSession(activeSession);
      } catch (error) {
        if (cancelled) return;
        setBootError(errorMessage(error));
        setMeta({ hasAccounts: false, smtpConfigured: false });
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const next = await getSession();
      setSession(next);
      if (!next) setResetToken(null);
    } catch {
      // A transient connection problem should not sign the user out.
    }
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;

    const url = eventsUrl();
    if (!url) return;

    const source = new EventSource(url);
    let timer: number | undefined;

    function schedule() {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void refreshSession();
      }, 120);
    }

    source.addEventListener("change", schedule);
    source.addEventListener("ready", schedule);

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      source.close();
    };
  }, [userId, refreshSession]);

  useEffect(() => {
    if (!userId) return;

    function handleVisibility() {
      if (document.visibilityState === "visible") void refreshSession();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [userId, refreshSession]);

  useEffect(() => {
    if (!session) return;

    try {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has("invite")) {
        url.searchParams.delete("invite");
        changed = true;
      }
      if (url.searchParams.has("reset")) {
        url.searchParams.delete("reset");
        changed = true;
      }
      if (changed) {
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      }
    } catch {
      // A URL that cannot be rewritten is harmless.
    }
  }, [session]);

  useEffect(() => {
    if (!session) document.title = "Taskly";
  }, [session]);

  async function handleAuthenticate(input: AuthInput) {
    setAuthBusy(true);
    setAuthError("");

    try {
      const result = await authenticate(input);
      if (!result.ok) {
        setAuthError(result.error);
        return;
      }

      setSession(result.session);
      setResetToken(null);
      setMeta((previous) =>
        previous
          ? { ...previous, hasAccounts: true }
          : { hasAccounts: true, smtpConfigured: false },
      );
    } catch {
      setAuthError("Couldn't sign in. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    await logout();
    setSession(null);
    setResetToken(null);
    setAuthError("");
  }

  async function handleRequestPasswordReset(
    email: string,
  ): Promise<PasswordResetRequestResult> {
    return requestPasswordReset(email);
  }

  async function handleCompletePasswordReset(
    token: string,
    password: string,
  ): Promise<ApiAuthResult> {
    const result = await completePasswordReset(token, password);
    if (result.ok) {
      setSession(result.session);
      setResetToken(null);
      setAuthError("");
      setMeta((previous) =>
        previous
          ? { ...previous, hasAccounts: true }
          : { hasAccounts: true, smtpConfigured: false },
      );
    }
    return result;
  }

  async function handleCreateTeam(): Promise<TeamActionResult> {
    if (!session) return { ok: false, error: "Sign in to create a team." };
    const result = await createTeam();
    if (result.ok) await refreshSession();
    return result;
  }

  async function handleInvite(
    teamId: string,
    email: string,
  ): Promise<TeamInviteResult> {
    if (!session) {
      return { ok: false, error: "Sign in to invite teammates." };
    }
    const result = await inviteTeamMember(teamId, email);
    if (result.ok) await refreshSession();
    return result;
  }

  async function handleAcceptInvite(
    teamId: string,
    inviteId: string,
  ): Promise<TeamActionResult> {
    if (!session) return { ok: false, error: "Sign in to join the team." };
    const result = await acceptTeamInvite(teamId, inviteId);
    if (result.ok) await refreshSession();
    return result;
  }

  async function handleDeclineInvite(
    teamId: string,
    inviteId: string,
  ): Promise<TeamActionResult> {
    if (!session) return { ok: false, error: "Sign in to respond." };
    const result = await declineTeamInvite(teamId, inviteId);
    if (result.ok) await refreshSession();
    return result;
  }

  async function handleCancelInvite(
    teamId: string,
    inviteId: string,
  ): Promise<TeamActionResult> {
    if (!session) return { ok: false, error: "Sign in to manage invites." };
    const result = await cancelTeamInvite(teamId, inviteId);
    if (result.ok) await refreshSession();
    return result;
  }

  async function handleRemoveTeamMember(
    teamId: string,
    memberId: string,
  ): Promise<TeamActionResult> {
    if (!session) return { ok: false, error: "Sign in to manage the team." };
    const result = await removeTeamMember(teamId, memberId);
    if (result.ok) await refreshSession();
    return result;
  }

  async function handleDeleteTeam(teamId: string): Promise<TeamActionResult> {
    if (!session) return { ok: false, error: "Sign in to manage the team." };
    const result = await deleteTeam(teamId);
    if (result.ok) await refreshSession();
    return result;
  }

  if (!session && !meta) {
    return (
      <main className="auth">
        <section className="auth__card">
          <div className="auth__brand">
            <span className="auth__brand-name">Taskly</span>
            <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
          </div>
          <h1 className="auth__title">
            {bootError ? "Can't reach Taskly" : "Connecting to Taskly…"}
          </h1>
          <p className="auth__subtitle">
            {bootError
              ? bootError
              : "Loading accounts and shared work from the local Taskly server."}
          </p>
          {bootError ? (
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        onSubmit={handleAuthenticate}
        onClearError={() => setAuthError("")}
        error={authError}
        busy={authBusy}
        initialMode={meta?.hasAccounts ? "signin" : "signup"}
        resetToken={resetToken}
        onRequestReset={handleRequestPasswordReset}
        onCompleteReset={handleCompletePasswordReset}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  return (
    <TasklyBoard
      key={session.user.id}
      user={session.user}
      initialState={session.state}
      teams={session.teams}
      invites={session.invites}
      focusInviteId={focusInviteId}
      onCreateTeam={handleCreateTeam}
      onInvite={handleInvite}
      onAcceptInvite={handleAcceptInvite}
      onDeclineInvite={handleDeclineInvite}
      onCancelInvite={handleCancelInvite}
      onLogout={handleLogout}
      onRemoveTeamMember={handleRemoveTeamMember}
      onDeleteTeam={handleDeleteTeam}
      theme={theme}
      onToggleTheme={handleToggleTheme}
    />
  );
}
