import type { messages } from "../locale";

type Text = typeof messages.en;

/** Support desk: answer tickets for this application. */
export function SupportHome({ t, displayName }: { t: Text; displayName: string }) {
  return (
    <div className="role-home">
      <p className="muted">{t.supportGreeting.replace("{name}", displayName)}</p>
      <h1>{t.supportTitle}</h1>
      <p className="muted">{t.supportIntro}</p>

      <section className="panel-section">
        <header className="bar">
          <h2>{t.supportInbox}</h2>
          <p className="muted">{t.supportQueueEmptyCount}</p>
        </header>
        <ul className="applications">
          <li className="bar muted"><span>{t.supportEmpty}</span></li>
        </ul>
      </section>
    </div>
  );
}
