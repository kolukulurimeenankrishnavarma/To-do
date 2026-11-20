import { useEffect, useState, type FormEvent } from "react";
import { AuthField } from "./AuthField";
import { StatusMessage } from "./StatusMessage";
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
              <AuthField
                id="auth-name"
                label="Full name"
                type="text"
                autoComplete="name"
                autoFocus
                warning={showWarning(name) ? nameError : null}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  clearAppError();
                }}
              />
            ) : null}

            <AuthField
              id="auth-email"
              label="Email address"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus={!isSignup}
              spellCheck={false}
              placeholder="you@example.com"
              warning={showWarning(email) ? emailWarning : null}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearAppError();
              }}
            />

            {isSignup ? (
              <AuthField
                id="auth-mobile"
                label="Mobile number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98765 43210"
                warning={showWarning(mobile) ? mobileError : null}
                value={mobile}
                onChange={(event) => {
                  setMobile(event.target.value);
                  clearAppError();
                }}
                prefix={
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
                }
              />
            ) : null}

            <AuthField
              id="auth-password"
              label="Password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              warning={showWarning(password) ? passwordError : null}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearAppError();
              }}
            />

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
            <AuthField
              id="auth-email"
              label="Email address"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              spellCheck={false}
              placeholder="you@example.com"
              warning={showWarning(email) ? emailError : null}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setResetMessage(null);
                setResetError("");
              }}
            />

            {resetError ? (
              <p className="auth__error" id="auth-forgot-error" role="alert">
                {resetError}
              </p>
            ) : null}

            {resetMessage ? (
              <StatusMessage
                id="auth-forgot-message"
                className="auth__message"
                kind={resetMessage.kind}
                text={resetMessage.text}
                link={resetMessage.link}
                linkClassName="auth__reset-link"
                linkId="auth-reset-link"
              />
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
                <AuthField
                  id="auth-reset-password"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  warning={submitted ? newPasswordError : null}
                  value={resetPassword}
                  onChange={(event) => {
                    setResetPassword(event.target.value);
                    setResetError("");
                  }}
                />

                <AuthField
                  id="auth-reset-confirm"
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  warning={confirmError}
                  value={resetConfirm}
                  onChange={(event) => {
                    setResetConfirm(event.target.value);
                    setResetError("");
                  }}
                />

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
