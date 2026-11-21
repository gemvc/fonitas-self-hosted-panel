import type { ReactNode } from "react";
import type { messages } from "../locale";

type Text = typeof messages.en;

const hostedAdmin = "https://developerpannel.fonitas.com/settings/custom-domains";

/** Local admin home: charts, summaries, and lists. Deep administration stays on Fonitas. */
export function AdminHome({ t, displayName }: { t: Text; displayName: string }) {
  return (
    <div className="role-home">
      <p className="muted">{t.adminGreeting.replace("{name}", displayName)}</p>
      <h1>{t.adminTitle}</h1>
      <p className="muted">{t.adminIntro}</p>

      <section className="stat-grid" aria-label={t.adminCharts}>
        <Stat label={t.statActiveLicenses} value="—" />
        <Stat label={t.statOpenTickets} value="—" />
        <Stat label={t.statCustomers} value="—" />
        <Stat label={t.statAppStatus} value="—" />
      </section>

      <section className="panel-section">
        <h2>{t.adminRecent}</h2>
        <ul className="applications">
          <li className="bar muted"><span>{t.adminEmptyList}</span></li>
        </ul>
      </section>

      <p className="hosted-link">
        <a href={hostedAdmin} target="_blank" rel="noopener noreferrer">{t.adminHosted}</a>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <article className="stat">
      <p className="muted">{label}</p>
      <p className="stat-value"><bdi>{value}</bdi></p>
    </article>
  );
}
