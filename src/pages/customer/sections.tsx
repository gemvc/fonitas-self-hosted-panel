import type { messages } from "../../locale";
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

export function ProfileSection({ t, displayName, onSignOut }: {
  t: Text;
  displayName: string;
  onSignOut: () => void;
}) {
  return (
    <SectionFrame title={t.navProfile} intro={t.profileIntro}>
      <section className="panel-section">
        <h2>{t.profileAccountHeading}</h2>
        <dl className="detail-list profile-list">
          <div><dt>{t.name}</dt><dd>{displayName}</dd></div>
          <div><dt>{t.email}</dt><dd>—</dd></div>
          <div><dt>{t.profileLanguage}</dt><dd>—</dd></div>
        </dl>
        <ActionRow>
          <button type="button" className="primary" disabled>{t.saveProfile}</button>
        </ActionRow>
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

      <section className="panel-section">
        <h2>{t.sessionHeading}</h2>
        <p className="muted">{t.sessionIntro}</p>
        <ActionRow>
          <button type="button" onClick={onSignOut}>{t.signOut}</button>
        </ActionRow>
      </section>

      <ComingSoonNote t={t} />
    </SectionFrame>
  );
}
