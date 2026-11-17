import type {
  ApiAuthResult,
  AppState,
  AuthInput,
  PasswordResetRequestResult,
  ServerMeta,
  SessionPayload,
  TeamActionResult,
  TeamInviteResult,
} from "../types";

const TOKEN_KEY = "taskly.server.token";
const CLIENT_KEY = "taskly.server.client";

let memoryToken: string | null = null;
let memoryClient: string | null = null;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function randomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  const storage = getSessionStorage();
  if (!storage) return memoryToken;

  try {
    return storage.getItem(TOKEN_KEY);
  } catch {
    return memoryToken;
  }
}

function setToken(token: string | null): void {
  memoryToken = token;
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    if (token) storage.setItem(TOKEN_KEY, token);
    else storage.removeItem(TOKEN_KEY);
  } catch {
    // The in-memory token still works for this page.
  }
}

export function getClientId(): string {
  if (memoryClient) return memoryClient;

  const storage = getSessionStorage();
  if (storage) {
    try {
      const existing = storage.getItem(CLIENT_KEY);
      if (existing) {
        memoryClient = existing;
        return existing;
      }
      const created = randomId();
      storage.setItem(CLIENT_KEY, created);
      memoryClient = created;
      return created;
    } catch {
      // Fall through to an in-memory identifier.
    }
  }

  memoryClient = randomId();
  return memoryClient;
}

export function errorMessage(error: unknown): string {
  return messageFor(error);
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === "AbortError") {
    return "The request was cancelled.";
  }
  return "Couldn't reach the Taskly server. Make sure it is running and try again.";
}

async function request<T>(
  route: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Taskly-Client", getClientId());
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(route, { ...options, headers });
  } catch {
    throw new ApiError(0, messageFor(null));
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) setToken(null);
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `The Taskly server returned ${response.status}.`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

export async function getMeta(): Promise<ServerMeta> {
  return request<ServerMeta>("/api/meta");
}

export async function getSession(): Promise<SessionPayload | null> {
  if (!getToken()) return null;

  try {
    return await request<SessionPayload>("/api/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function authenticate(input: AuthInput): Promise<ApiAuthResult> {
  const isSignup = input.name !== undefined || input.mobile !== undefined;

  try {
    const response = await request<{ token: string; session: SessionPayload }>(
      isSignup ? "/api/auth/register" : "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify(
          isSignup
            ? {
                name: input.name,
                email: input.email,
                mobile: input.mobile,
                countryDial: input.countryDial,
                password: input.password,
              }
            : { email: input.email, password: input.password },
        ),
      },
    );

    setToken(response.token);
    return { ok: true, session: response.session, created: isSignup };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function logout(): Promise<void> {
  try {
    await request<{ ok: true }>("/api/auth/logout", { method: "POST" });
  } catch {
    // Clearing the tab token is enough even if the server is unreachable.
  } finally {
    setToken(null);
  }
}

export async function checkEmailExists(email: string): Promise<boolean> {
  const response = await request<{ exists: boolean }>(
    `/api/check-email?email=${encodeURIComponent(email)}`,
  );
  return response.exists;
}

export async function requestPasswordReset(
  email: string,
): Promise<PasswordResetRequestResult> {
  try {
    return await request<PasswordResetRequestResult>(
      "/api/auth/forgot-password",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function completePasswordReset(
  token: string,
  password: string,
): Promise<ApiAuthResult> {
  try {
    const response = await request<{ token: string; session: SessionPayload }>(
      "/api/auth/reset-password",
      {
        method: "POST",
        body: JSON.stringify({ token, password }),
      },
    );

    setToken(response.token);
    return { ok: true, session: response.session, created: false };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function savePrivateState(state: AppState): Promise<void> {
  await request<{ ok: true }>("/api/private-state", {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
}

export async function saveTeamState(
  teamId: string,
  state: AppState,
): Promise<void> {
  await request<{ ok: true }>(`/api/teams/${encodeURIComponent(teamId)}/state`, {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
}

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: messageFor(error) };
}

export async function createTeam(name?: string): Promise<TeamActionResult> {
  try {
    const response = await request<{ ok: true; teamId: string }>("/api/teams", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return { ok: true, teamId: response.teamId };
  } catch (error) {
    return failure(error);
  }
}

export async function removeTeamMember(
  teamId: string,
  memberId: string,
): Promise<TeamActionResult> {
  try {
    const response = await request<{ ok: true; teamId: string }>(
      `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(
        memberId,
      )}`,
      { method: "DELETE" },
    );
    return { ok: true, teamId: response.teamId };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTeam(teamId: string): Promise<TeamActionResult> {
  try {
    await request<{ ok: true }>(`/api/teams/${encodeURIComponent(teamId)}`, {
      method: "DELETE",
    });
    return { ok: true, teamId };
  } catch (error) {
    return failure(error);
  }
}

export async function inviteTeamMember(
  teamId: string,
  email: string,
): Promise<TeamInviteResult> {
  try {
    return await request<TeamInviteResult>(
      `/api/teams/${encodeURIComponent(teamId)}/invites`,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
    );
  } catch (error) {
    return failure(error);
  }
}

async function respondToInvite(
  teamId: string,
  inviteId: string,
  action: "accept" | "decline",
): Promise<TeamActionResult> {
  try {
    const response = await request<{ ok: true; teamId: string }>(
      `/api/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(
        inviteId,
      )}/${action}`,
      { method: "POST" },
    );
    return { ok: true, teamId: response.teamId };
  } catch (error) {
    return failure(error);
  }
}

export function acceptTeamInvite(
  teamId: string,
  inviteId: string,
): Promise<TeamActionResult> {
  return respondToInvite(teamId, inviteId, "accept");
}

export function declineTeamInvite(
  teamId: string,
  inviteId: string,
): Promise<TeamActionResult> {
  return respondToInvite(teamId, inviteId, "decline");
}

export async function cancelTeamInvite(
  teamId: string,
  inviteId: string,
): Promise<TeamActionResult> {
  try {
    const response = await request<{ ok: true; teamId: string }>(
      `/api/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(
        inviteId,
      )}`,
      { method: "DELETE" },
    );
    return { ok: true, teamId: response.teamId };
  } catch (error) {
    return failure(error);
  }
}

export function eventsUrl(): string | null {
  const token = getToken();
  if (!token) return null;
  return `/api/events?token=${encodeURIComponent(token)}&client=${encodeURIComponent(
    getClientId(),
  )}`;
}
