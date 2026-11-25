import { useState, type FormEvent, type ReactNode } from "react";
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
  const [codeSent, setCodeSent] = useState(() => isVerificationEmailPending());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GateError | null>(null);

  function mapIdentityError(cause: unknown): GateError {
    if (cause instanceof IdentityApiError) {
      if (cause.message === "rate_limited") return "rateLimited";
      if (cause.message === "validation") return "validation";
    }
    return "unavailable";
  }

  async function sendCode() {
    if (busy) return;
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
      setError(mapIdentityError(cause));
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
      setError(mapIdentityError(cause));
    } finally {
      setBusy(false);
    }
  }

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
          {codeSent && <p role="status">{t.verificationEmailSent}</p>}
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
          <button type="button" className="full" onClick={() => void sendCode()} disabled={!email || busy}>
            {codeSent ? t.resendVerificationCode : t.sendVerificationCode}
          </button>
          {error && <p role="alert" className="error">{t[error]}</p>}
          <button type="button" className="full" onClick={onSignOut} disabled={busy}>{t.signOut}</button>
        </section>
      </section>
    </main>
  );
}
