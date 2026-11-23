import type { ReactNode } from "react";
import type { messages } from "../../locale";

type Text = typeof messages.en;

export function SectionFrame({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="role-home">
      <h1>{title}</h1>
      <p className="muted">{intro}</p>
      {children}
    </div>
  );
}

export function EmptyPanel({ message }: { message: string }) {
  return (
    <ul className="applications">
      <li className="bar muted"><span>{message}</span></li>
    </ul>
  );
}

export function ComingSoonNote({ t }: { t: Text }) {
  return <p className="muted panel-note">{t.dataPending}</p>;
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="actions panel-actions">{children}</div>;
}
