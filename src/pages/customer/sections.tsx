import { useState, type FormEvent } from "react";
import {
  IdentityApiError,
  resendEmailVerification,
  verificationCodePattern,
  verifyEmailByCode,
} from "../../identity-api";
import type { messages } from "../../locale";
import {
  clearVerificationEmailPending,
  isVerificationEmailPending,
  markVerificationEmailPending,
  updateLocalMe,
  type PanelMe,
} from "../../panel-me";
import { ActionRow, ComingSoonNote, EmptyPanel, SectionFrame } from "./section-frame";

type Text = typeof messages.en;
type Go = (section: import("../../customer-nav").CustomerSection) => void;

export function OverviewSection({ t, displayName, go }: { t: Text; displayName: string; go: Go }) {
  return (
    <div className="role-home">
      <p className="muted">{t.customerGreeting.replace("{name}", displayName)}</p>
      <h1>{t.navOverview}</h1>
      <p className="muted">{t.overviewIntro}</p>

      <div className="stat-grid">
        <button type="button" className="stat stat-link" onClick={() => go("licenses")}>
          <span className="muted">{t.navLicenses}</span>
          <span className="stat-value">—</span>
        </button>
        <button type="button" className="stat stat-link" onClick={() => go("subscriptions")}>
          <span className="muted">{t.navSubscriptions}</span>
          <span className="stat-value">—</span>
        </button>
        <button type="button" className="stat stat-link" onClick={() => go("billing")}>
          <span className="muted">{t.navBilling}</span>
          <span className="stat-value">—</span>
        </button>
        <button type="button" className="stat stat-link" onClick={() => go("support")}>
          <span className="muted">{t.navSupport}</span>
          <span className="stat-value">—</span>
        </button>
      </div>

      <ActionRow>
        <button type="button" className="primary" onClick={() => go("buy")}>{t.buyNow}</button>
        <button type="button" onClick={() => go("profile")}>{t.navProfile}</button>
      </ActionRow>
      <ComingSoonNote t={t} />
    </div>
  );
}

export function BuySection({ t }: { t: Text }) {
  return (
    <SectionFrame title={t.navBuy} intro={t.buyIntro}>
      <EmptyPanel message={t.buyEmpty} />
      <ActionRow>
        <button type="button" className="primary" disabled>{t.buyNow}</button>
      </ActionRow>
      <ComingSoonNote t={t} />
    </SectionFrame>
  );
}

export function LicensesSection({ t }: { t: Text }) {
  return (
    <SectionFrame title={t.navLicenses} intro={t.licensesIntro}>
      <EmptyPanel message={t.licensesEmpty} />

      <section className="panel-section">
        <h2>{t.licenseKindsTitle}</h2>
        <dl className="detail-list">
          <div><dt>{t.licenseKindPerpetual}</dt><dd>{t.licenseKindPerpetualHint}</dd></div>
          <div><dt>{t.licenseKindSubscription}</dt><dd>{t.licenseKindSubscriptionHint}</dd></div>
          <div><dt>{t.licenseKindDevice}</dt><dd>{t.licenseKindDeviceHint}</dd></div>
          <div><dt>{t.licenseKindMultiDevice}</dt><dd>{t.licenseKindMultiDeviceHint}</dd></div>
        </dl>
      </section>

      <section className="panel-section">
        <h2>{t.devicesHeading}</h2>
        <p className="muted">{t.devicesIntro}</p>
        <EmptyPanel message={t.devicesEmpty} />
        <ActionRow>
          <button type="button" className="primary" disabled>{t.registerDevice}</button>
          <button type="button" disabled>{t.removeDevice}</button>
        </ActionRow>
      </section>

      <ComingSoonNote t={t} />
    </SectionFrame>
  );
}

export function SubscriptionsSection({ t, go }: { t: Text; go: Go }) {
  return (
    <SectionFrame title={t.navSubscriptions} intro={t.subscriptionsIntro}>
      <EmptyPanel message={t.subscriptionsEmpty} />
      <ActionRow>
        <button type="button" className="primary" onClick={() => go("buy")}>{t.registerSubscription}</button>
        <button type="button" disabled>{t.cancelSubscription}</button>
      </ActionRow>
      <ComingSoonNote t={t} />
    </SectionFrame>
  );
}

export function BillingSection({ t }: { t: Text }) {
  return (
    <SectionFrame title={t.navBilling} intro={t.billingIntro}>
      <section className="panel-section">
        <h2>{t.purchasesHeading}</h2>
        <p className="muted">{t.purchasesIntro}</p>
        <EmptyPanel message={t.purchasesEmpty} />
      </section>
      <section className="panel-section">
        <h2>{t.paymentsHeading}</h2>
        <p className="muted">{t.paymentsIntro}</p>
        <EmptyPanel message={t.paymentsEmpty} />
      </section>
      <ComingSoonNote t={t} />
    </SectionFrame>
  );
}

export function SupportSection({ t }: { t: Text }) {
  return (
    <SectionFrame title={t.navSupport} intro={t.ticketsIntro}>
      <EmptyPanel message={t.ticketsEmpty} />
      <ActionRow>
        <button type="button" className="primary" disabled>{t.newTicket}</button>
      </ActionRow>
      <ComingSoonNote t={t} />
    </SectionFrame>
  );
}

export function ProfileSection({
  t,
  me,
  onMeChange,
}: {
  t: Text;
  me: PanelMe;
  onMeChange: (me: PanelMe) => void;
}) {
  const email = me.email ?? "";
  const [verified, setVerified] = useState(Boolean(me.email_verified));
  const [codeSent, setCodeSent] = useState(() => isVerificationEmailPending());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<
    "verifyFailed" | "verifyInvalid" | "rateLimited" | "unavailable" | "missingEmail" | "validation" | null
  >(null);

  function mapIdentityError(cause: unknown): typeof error {
    if (cause instanceof IdentityApiError) {
      if (cause.message === "rate_limited") return "rateLimited";
      if (cause.message === "validation") return "validation";
    }
    return "unavailable";
  }

  async function sendCode() {
    if (busy || verified) return;
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
    if (busy || verified) return;
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
      setVerified(true);
      clearVerificationEmailPending();
      const next = updateLocalMe({ email_verified: true }) ?? { ...me, email_verified: true };
      onMeChange(next);
      event.currentTarget.reset();
    } catch (cause) {
      setError(mapIdentityError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionFrame title={t.navProfile} intro={t.profileIntro}>
      <section className="panel-section">
        <h2>{t.profileAccountHeading}</h2>
        <dl className="detail-list profile-list">
          <div><dt>{t.name}</dt><dd>{me.display_name}</dd></div>
          <div>
            <dt>{t.email}</dt>
            <dd className="email-status">
              <span>{email || "—"}</span>
              {verified ? (
                <span className="verified-badge" role="status">
                  <span className="verified-check" aria-hidden="true">✓</span>
                  {t.emailVerified}
                </span>
              ) : (
                <span className="muted">{t.emailUnverified}</span>
              )}
            </dd>
          </div>
          <div><dt>{t.profileLanguage}</dt><dd>—</dd></div>
        </dl>
        <ActionRow>
          <button type="button" className="primary" disabled>{t.saveProfile}</button>
        </ActionRow>
      </section>

      <section className="panel-section">
        <h2>{t.verifyEmailHeading}</h2>
        {verified ? (
          <p className="verified-line" role="status">
            <span className="verified-check" aria-hidden="true">✓</span>
            {t.emailVerifiedMessage}
          </p>
        ) : (
          <>
            <p className="muted">{t.verifyEmailIntro}</p>
            {codeSent && (
              <p role="status">{t.verificationEmailSent}</p>
            )}
            <ActionRow>
              <button type="button" onClick={() => void sendCode()} disabled={!email || busy}>
                {busy && !codeSent ? t.loading : codeSent ? t.resendVerificationCode : t.sendVerificationCode}
              </button>
            </ActionRow>
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
                />
              </label>
              <p className="muted">{t.verificationCodeHint}</p>
              <button type="submit" className="primary" disabled={!email || busy}>{t.submitVerificationCode}</button>
            </form>
            {error && <p role="alert" className="error">{t[error]}</p>}
          </>
        )}
      </section>

      <section className="panel-section">
        <h2>{t.changePassword}</h2>
        <p className="muted">{t.changePasswordIntro}</p>
        <form className="profile-form" onSubmit={event => event.preventDefault()}>
          <label>{t.currentPassword}
            <input type="password" autoComplete="current-password" disabled />
          </label>
          <label>{t.newPassword}
            <input type="password" autoComplete="new-password" disabled />
          </label>
          <label>{t.confirmPassword}
            <input type="password" autoComplete="new-password" disabled />
          </label>
          <button type="submit" className="primary" disabled>{t.changePassword}</button>
        </form>
      </section>

      <section className="panel-section">
        <h2>{t.paymentMethodsHeading}</h2>
        <p className="muted">{t.paymentMethodsIntro}</p>
        <EmptyPanel message={t.paymentMethodsEmpty} />
        <ActionRow>
          <button type="button" className="primary" disabled>{t.addPaymentMethod}</button>
        </ActionRow>
      </section>

      <section className="panel-section">
        <h2>{t.emailHeading}</h2>
        <p className="muted">{t.emailIntro}</p>
        <EmptyPanel message={t.emailEmpty} />
      </section>

      <ComingSoonNote t={t} />
    </SectionFrame>
  );
}
