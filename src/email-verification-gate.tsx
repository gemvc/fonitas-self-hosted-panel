import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  IdentityApiError,
  resendEmailVerification,
  verificationCodePattern,
  verifyEmailByCode,
} from "./identity-api";
import type { messages } from "./locale";
import {
  clearVerificationEmailPending,
  isVerificationEmailPending,
  markVerificationEmailPending,
  updateLocalMe,
  type PanelMe,
} from "./panel-me";

type Text = typeof messages.en;

type GateError =
  | "verifyFailed"
  | "verifyInvalid"
  | "rateLimited"
  | "unavailable"
  | "missingEmail"
  | "validation";

function formatWait(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} min`;
  }
  return `${seconds}s`;
}

/** Full-page gate: unverified customers only enter the account after the code succeeds. */
export function EmailVerificationGate({
  t,
  me,
  menu,
  onVerified,
  onSignOut,
}: {
  t: Text;
  me: PanelMe;
  menu: ReactNode;
  onVerified: (me: PanelMe) => void;
  onSignOut: () => void;
}) {
  const email = me.email ?? "";
  // Do not treat register-time pending as "already sent this session" — that made the
  // button say Resend before any successful click, and returning users got stuck.
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GateError | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const registeredHint = isVerificationEmailPending();

  useEffect(() => {
    if (cooldownUntil <= 0) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left <= 0) setCooldownUntil(0);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function applyRateLimit(cause: unknown): GateError {
    if (cause instanceof IdentityApiError && cause.message === "rate_limited") {
      const seconds = cause.retryAfterSeconds ?? 60;
      setCooldownUntil(Date.now() + seconds * 1000);
      return "rateLimited";
    }
    if (cause instanceof IdentityApiError && cause.message === "validation") {
      return "validation";
    }
    return "unavailable";
  }

  /** Same path for first send and every resend (Identity POST /auth/verification/resend). */
  async function sendCode() {
    if (busy || cooldownLeft > 0) return;
    if (!email) {
      setError("missingEmail");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resendEmailVerification(email);
      setCodeSent(true);
      markVerificationEmailPending();
    } catch (cause) {
      setError(applyRateLimit(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!email) {
      setError("missingEmail");
      return;
    }
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    if (!verificationCodePattern.test(code)) {
      setError("verifyInvalid");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyEmailByCode(email, code);
      if (!ok) {
        setError("verifyFailed");
        return;
      }
      clearVerificationEmailPending();
      const next = updateLocalMe({ email_verified: true }) ?? { ...me, email_verified: true };
      onVerified(next);
      event.currentTarget.reset();
    } catch (cause) {
      setError(applyRateLimit(cause));
    } finally {
      setBusy(false);
    }
  }

  const sendBlocked = !email || busy || cooldownLeft > 0;
  const sendLabel = busy
    ? t.loading
    : cooldownLeft > 0
      ? t.rateLimitedWait.replace("{wait}", formatWait(cooldownLeft))
      : codeSent
        ? t.resendVerificationCode
        : t.sendVerificationCode;

  const errorText = error === "rateLimited" && cooldownLeft > 0
    ? t.rateLimitedWait.replace("{wait}", formatWait(cooldownLeft))
    : error
      ? t[error]
      : null;

  return (
    <main className="setup">
      <section className="card">
        <header className="bar"><strong>Fonitas</strong>{menu}</header>
        <section className="auth">
          <h1>{t.verifyEmailHeading}</h1>
          <p className="muted">{t.verifyGateIntro}</p>
          <p className="email-status">
            <span dir="ltr">{email || "—"}</span>
            <span className="muted">{t.emailUnverified}</span>
          </p>
          {(registeredHint || codeSent) && (
            <p role="status">{codeSent ? t.verificationEmailSent : t.verificationRegisterHint}</p>
          )}
          <button
            type="button"
            className="primary full"
            onClick={() => void sendCode()}
            disabled={sendBlocked}
          >
            {sendLabel}
          </button>
          <form className="profile-form" onSubmit={event => void submitCode(event)}>
            <label>{t.verificationCode}
              <input
                name="code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                spellCheck={false}
                maxLength={8}
                minLength={8}
                pattern="(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8}"
                dir="ltr"
                required
                disabled={busy}
                autoFocus
              />
            </label>
            <p className="muted">{t.verificationCodeHint}</p>
            <button type="submit" className="primary full" disabled={!email || busy}>
              {busy ? t.loading : t.submitVerificationCode}
            </button>
          </form>
          {errorText && <p role="alert" className="error">{errorText}</p>}
          <button type="button" className="full" onClick={onSignOut} disabled={busy}>{t.signOut}</button>
        </section>
      </section>
    </main>
  );
}
