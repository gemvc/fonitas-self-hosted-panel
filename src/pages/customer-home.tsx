import type { messages } from "../locale";

type Text = typeof messages.en;

/** Customer panel: purchases, license term/type, and upgrades. */
export function CustomerHome({ t, displayName }: { t: Text; displayName: string }) {
  return (
    <div className="role-home">
      <p className="muted">{t.customerGreeting.replace("{name}", displayName)}</p>
      <h1>{t.customerTitle}</h1>
      <p className="muted">{t.customerIntro}</p>

      <section className="panel-section">
        <h2>{t.customerPurchases}</h2>
        <ul className="applications">
          <li className="bar muted"><span>{t.customerEmpty}</span></li>
        </ul>
      </section>

      <section className="panel-section">
        <h2>{t.customerLicense}</h2>
        <dl className="detail-list">
          <div><dt>{t.customerType}</dt><dd>—</dd></div>
          <div><dt>{t.customerPurchased}</dt><dd>—</dd></div>
          <div><dt>{t.customerValidUntil}</dt><dd>—</dd></div>
        </dl>
        <button type="button" className="primary" disabled>{t.customerUpgrade}</button>
      </section>
    </div>
  );
}
