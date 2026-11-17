import { useEffect, useState, type FormEvent } from "react";
import { CheckIcon } from "./Icons";
import { CountryPicker } from "./CountryPicker";
import { ThemeToggle } from "./ThemeToggle";
import {
  normalizeName,
  parseEmail,
  parseMobile,
  resolveMobile,
  validateName,
  validatePassword,
} from "../lib/auth";
import { checkEmailExists } from "../lib/api";
import { defaultCountry } from "../lib/countryCodes";
import type { Theme } from "../lib/theme";
import type {
  ApiAuthResult,
  AuthInput,
  AuthMode,
  PasswordResetRequestResult,
} from "../types";

type AuthScreenProps = {
  onSubmit: (input: AuthInput) => Promise<void>;
  onClearError: () => void;
  error: string;
  busy: boolean;
  initialMode: AuthMode;
  resetToken: string | null;
  onRequestReset: (email: string) => Promise<PasswordResetRequestResult>;
  onCompleteReset: (token: string, password: string) => Promise<ApiAuthResult>;
  theme: Theme;
  onToggleTheme: () => void;
};

type Panel = "auth" | "forgot" | "reset";

type ResetMessage = {
  kind: "success" | "error";
  text: string;
  link?: string;
};

export function AuthScreen({
  onSubmit,
  onClearError,
  error,
  busy,
  initialMode,
  resetToken,
  onRequestReset,
  onCompleteReset,
  theme,
  onToggleTheme,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [panel, setPanel] = useState<Panel>(resetToken ? "reset" : "auth");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [submitted, setSubmitted] = useState(false);
  const [takenEmail, setTakenEmail] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState<ResetMessage | null>(null);

  const isSignup = panel === "auth" && mode === "signup";
  const isForgot = panel === "forgot";
  const isReset = panel === "reset";

  const nameError = isSignup ? validateName(name) : null;
  const emailResult = parseEmail(email);
  const emailError = emailResult.ok ? null : emailResult.error;
  const mobileResult = isSignup
    ? parseMobile(resolveMobile(mobile, country.dial))
    : null;
  const mobileError =
    isSignup && mobileResult && !mobileResult.ok ? mobileResult.error : null;
  const passwordError = validatePassword(password);
  const newPasswordError = validatePassword(resetPassword);
  const confirmError =
    resetConfirm.length > 0 && resetConfirm !== resetPassword
      ? "Passwords do not match."
      : null;

  // Ask the server whether this address already has an account, debounced so
  // every keystroke does not become a request.
  useEffect(() => {
    if (!isSignup) return;

    const parsed = parseEmail(email);
    if (!parsed.ok) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkEmailExists(parsed.value.email)
        .then((exists) => {
          if (!cancelled) setTakenEmail(exists ? parsed.value.email : null);
        })
        .catch(() => {
          // The server still rejects duplicate registrations on submit.
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, isSignup]);

  const emailTaken =
    isSignup && emailResult.ok && takenEmail === emailResult.value.email
      ? `An account already exists for “${emailResult.value.email}”. Sign in instead.`
      : null;

  const emailWarning = emailError ?? emailTaken;

  const showWarning = (value: string) =>
    Boolean(submitted || value.length > 0);

  function clearAppError() {
    if (error) onClearError();
  }

  function showPanel(nextPanel: Panel) {
    setPanel(nextPanel);
    setSubmitted(false);
    setResetError("");
    setResetMessage(null);
    clearAppError();
  }

  function switchMode(nextMode: AuthMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    showPanel("auth");
  }

  function openForgot() {
    setMode("signin");
    showPanel("forgot");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setSubmitted(true);
    if (
      !emailResult.ok ||
      passwordError ||
      (isSignup && (nameError || !mobileResult || !mobileResult.ok))
    ) {
      return;
    }

    if (isSignup) {
      if (!mobileResult || !mobileResult.ok) return;

      try {
        if (await checkEmailExists(emailResult.value.email)) {
          setTakenEmail(emailResult.value.email);
          return;
        }
      } catch {
        // Let the server reject the duplicate if the check cannot be made.
      }

      await onSubmit({
        name: normalizeName(name),
        email: emailResult.value.email,
        mobile: mobileResult.value.mobile,
        countryDial: country.dial,
        password,
      });
      return;
    }

    await onSubmit({ email: emailResult.value.email, password });
  }

  async function handleForgotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetBusy) return;

    setSubmitted(true);
    if (!emailResult.ok) return;

    setResetBusy(true);
    setResetError("");
    setResetMessage(null);

    const result = await onRequestReset(emailResult.value.email);
    setResetBusy(false);

    if (!result.ok) {
      setResetError(result.error);
      return;
    }

    if (result.resetUrl) {
      setResetMessage({
        kind: "success",
        text: result.emailSent
          ? `A reset link was emailed to ${emailResult.value.email}. You can also use the link below.`
          : `Use the reset link below to choose a new password for ${emailResult.value.email}.`,
        link: result.resetUrl,
      });
      return;
    }

    if (result.emailSent) {
      setResetMessage({
        kind: "success",
        text: `A reset link was emailed to ${emailResult.value.email} if that account exists.`,
      });
      return;
    }

    setResetMessage({
      kind: result.emailError ? "error" : "success",
      text: result.emailError
        ? `Password reset email could not be sent: ${result.emailError}`
        : `If an account exists for ${emailResult.value.email}, password reset instructions were sent.`,
    });
  }

  async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetBusy || !resetToken) return;

    setSubmitted(true);
    if (newPasswordError || resetConfirm !== resetPassword) return;

    setResetBusy(true);
    setResetError("");

    const result = await onCompleteReset(resetToken, resetPassword);
    setResetBusy(false);

    if (!result.ok) setResetError(result.error);
    // On success the parent stores the new session and this screen unmounts.
  }

  return (
    <main className="auth">
      <section className="auth__card" aria-labelledby="auth-heading">
        <div className="auth__brand">
          <span className="auth__logo" aria-hidden="true">
            <CheckIcon />
          </span>
          <span className="auth__brand-name">Taskly</span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <h1 className="auth__title" id="auth-heading">
          {isReset
            ? "Choose a new password"
            : isForgot
              ? "Reset your password"
              : isSignup
                ? "Create your account"
                : "Welcome back"}
        </h1>
        <p className="auth__subtitle">
          {isReset
            ? "Set a new password for your Taskly account. Each reset link works once and expires after one hour."
            : isForgot
              ? "Enter the email address on your account to create a password reset link."
              : isSignup
                ? "Your name, email, and mobile number keep your private tasks and shared team work tied to you."
                : "Sign in with the email address you used when you created your account."}
        </p>

        {panel === "auth" ? (
          <div className="auth__modes" role="group" aria-label="Account action">
            <button
              type="button"
              className={`auth__mode${!isSignup ? " auth__mode--active" : ""}`}
              id="auth-mode-signin"
              aria-pressed={!isSignup}
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`auth__mode${isSignup ? " auth__mode--active" : ""}`}
              id="auth-mode-signup"
              aria-pressed={isSignup}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
          </div>
        ) : null}

        {panel === "auth" ? (
          <form
            className="auth__form"
            id="auth-form"
            onSubmit={handleSubmit}
            noValidate
          >
            {isSignup ? (
              <div className="auth__field">
                <label htmlFor="auth-name">Full name</label>
                <input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  aria-invalid={
                    showWarning(name) && nameError ? true : undefined
                  }
                  aria-describedby={
                    showWarning(name) && nameError
                      ? "auth-name-warning"
                      : undefined
                  }
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    clearAppError();
                  }}
                />
                {showWarning(name) && nameError ? (
                  <span
                    className="auth__warning"
                    id="auth-name-warning"
                    role="status"
                  >
                    {nameError}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="auth__field">
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus={!isSignup}
                spellCheck={false}
                placeholder="you@example.com"
                aria-invalid={
                  showWarning(email) && emailWarning ? true : undefined
                }
                aria-describedby={
                  showWarning(email) && emailWarning
                    ? "auth-email-warning"
                    : undefined
                }
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearAppError();
                }}
              />
              {showWarning(email) && emailWarning ? (
                <span
                  className="auth__warning"
                  id="auth-email-warning"
                  role="status"
                >
                  {emailWarning}
                </span>
              ) : null}
            </div>

            {isSignup ? (
              <div className="auth__field">
                <label htmlFor="auth-mobile">Mobile number</label>
                <div className="auth__mobile">
                  <CountryPicker
                    value={country}
                    onChange={(next) => {
                      setCountry(next);
                      clearAppError();
                    }}
                    buttonId="auth-country-button"
                    searchId="auth-country-search"
                    listId="auth-country-list"
                  />
                  <input
                    id="auth-mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    aria-invalid={
                      showWarning(mobile) && mobileError ? true : undefined
                    }
                    aria-describedby={
                      showWarning(mobile) && mobileError
                        ? "auth-mobile-warning"
                        : undefined
                    }
                    value={mobile}
                    onChange={(event) => {
                      setMobile(event.target.value);
                      clearAppError();
                    }}
                  />
                </div>
                {showWarning(mobile) && mobileError ? (
                  <span
                    className="auth__warning"
                    id="auth-mobile-warning"
                    role="status"
                  >
                    {mobileError}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="auth__field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                aria-invalid={
                  showWarning(password) && passwordError ? true : undefined
                }
                aria-describedby={
                  showWarning(password) && passwordError
                    ? "auth-password-warning"
                    : undefined
                }
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearAppError();
                }}
              />
              {showWarning(password) && passwordError ? (
                <span
                  className="auth__warning"
                  id="auth-password-warning"
                  role="status"
                >
                  {passwordError}
                </span>
              ) : null}
            </div>

            {!isSignup ? (
              <div className="auth__field-row">
                <button
                  type="button"
                  className="link-btn"
                  id="auth-forgot-link"
                  onClick={openForgot}
                >
                  Forgot password?
                </button>
              </div>
            ) : null}

            {error ? (
              <p className="auth__error" id="auth-error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              className="btn btn--primary auth__submit"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Please wait…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        ) : null}

        {isForgot ? (
          <form
            className="auth__form"
            id="auth-forgot-form"
            onSubmit={handleForgotSubmit}
            noValidate
          >
            <div className="auth__field">
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                spellCheck={false}
                placeholder="you@example.com"
                aria-invalid={
                  showWarning(email) && emailError ? true : undefined
                }
                aria-describedby={
                  showWarning(email) && emailError
                    ? "auth-email-warning"
                    : undefined
                }
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setResetMessage(null);
                  setResetError("");
                }}
              />
              {showWarning(email) && emailError ? (
                <span
                  className="auth__warning"
                  id="auth-email-warning"
                  role="status"
                >
                  {emailError}
                </span>
              ) : null}
            </div>

            {resetError ? (
              <p className="auth__error" id="auth-forgot-error" role="alert">
                {resetError}
              </p>
            ) : null}

            {resetMessage ? (
              <div
                className={`auth__message auth__message--${resetMessage.kind}`}
                id="auth-forgot-message"
                role="status"
              >
                <p>{resetMessage.text}</p>
                {resetMessage.link ? (
                  <p className="auth__reset-link">
                    <a id="auth-reset-link" href={resetMessage.link}>
                      {resetMessage.link}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}

            <button
              className="btn btn--primary auth__submit"
              type="submit"
              disabled={resetBusy}
            >
              {resetBusy ? "Creating link…" : "Create reset link"}
            </button>
            <button
              type="button"
              className="link-btn auth__back"
              id="auth-back-signin"
              onClick={() => showPanel("auth")}
            >
              Back to sign in
            </button>
          </form>
        ) : null}

        {isReset ? (
          <form
            className="auth__form"
            id="auth-reset-form"
            onSubmit={handleResetSubmit}
            noValidate
          >
            {resetToken ? (
              <>
                <div className="auth__field">
                  <label htmlFor="auth-reset-password">New password</label>
                  <input
                    id="auth-reset-password"
                    type="password"
                    autoComplete="new-password"
                    autoFocus
                    aria-invalid={
                      submitted && newPasswordError ? true : undefined
                    }
                    aria-describedby={
                      submitted && newPasswordError
                        ? "auth-reset-password-warning"
                        : undefined
                    }
                    value={resetPassword}
                    onChange={(event) => {
                      setResetPassword(event.target.value);
                      setResetError("");
                    }}
                  />
                  {submitted && newPasswordError ? (
                    <span
                      className="auth__warning"
                      id="auth-reset-password-warning"
                      role="status"
                    >
                      {newPasswordError}
                    </span>
                  ) : null}
                </div>

                <div className="auth__field">
                  <label htmlFor="auth-reset-confirm">Confirm new password</label>
                  <input
                    id="auth-reset-confirm"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={confirmError ? true : undefined}
                    aria-describedby={
                      confirmError ? "auth-reset-confirm-warning" : undefined
                    }
                    value={resetConfirm}
                    onChange={(event) => {
                      setResetConfirm(event.target.value);
                      setResetError("");
                    }}
                  />
                  {confirmError ? (
                    <span
                      className="auth__warning"
                      id="auth-reset-confirm-warning"
                      role="status"
                    >
                      {confirmError}
                    </span>
                  ) : null}
                </div>

                {resetError ? (
                  <p className="auth__error" id="auth-reset-error" role="alert">
                    {resetError}
                  </p>
                ) : null}

                <button
                  className="btn btn--primary auth__submit"
                  type="submit"
                  disabled={resetBusy}
                >
                  {resetBusy ? "Saving…" : "Set new password"}
                </button>
              </>
            ) : (
              <p className="auth__error" id="auth-reset-error" role="alert">
                This reset link is invalid or has expired. Request a new link
                from the sign-in page.
              </p>
            )}

            <button
              type="button"
              className="link-btn auth__back"
              id="auth-back-signin-reset"
              onClick={() => showPanel("auth")}
            >
              Back to sign in
            </button>
          </form>
        ) : null}

        <p className="auth__hint">
          {isReset ? (
            <>
              The reset link can only be used once. After choosing a new
              password you will be signed in automatically.
            </>
          ) : isForgot ? (
            <>
              If SMTP is not configured, the reset link appears right here so
              you can continue without email delivery.
            </>
          ) : isSignup ? (
            <>
              Choose a country code and enter the national mobile number, or
              type a full number starting with <code>+</code>. Typing a dial
              code in the country search, like <code>91</code>, selects that
              country.
            </>
          ) : (
            <>
              Login uses your email address only. Mobile numbers are saved on
              your profile and never used to sign in.
            </>
          )}
        </p>
        <p className="auth__note">
          Accounts, private tasks, and team tasks are stored on the Taskly
          server. Team tasks are shared with every accepted member.
        </p>
      </section>
    </main>
  );
}
