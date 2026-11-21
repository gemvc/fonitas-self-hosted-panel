import { useEffect, useState, type ReactNode } from "react";
import type { messages } from "./locale";
import { loadPanelMe, SessionEndedError, type PanelMe } from "./panel-me";
import { AdminHome } from "./pages/admin-home";
import { CustomerHome } from "./pages/customer-home";
import { SupportHome } from "./pages/support-home";
import { defaultHome, homesFrom, isWorkspaceHome, type WorkspaceHome } from "./roles";

type Text = typeof messages.en;

const homeLabel: Record<WorkspaceHome, keyof Text> = {
  admin: "roleAdmin",
  support: "roleSupport",
  customer: "roleCustomer",
};

export function Workspace({
  token,
  endSession,
  onSignOut,
  t,
  menu,
}: {
  token: string;
  endSession: () => void;
  onSignOut: () => void;
  t: Text;
  menu: ReactNode;
}) {
  const [me, setMe] = useState<PanelMe>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [activeHome, setActiveHome] = useState<WorkspaceHome | null>(null);
  const available = me ? homesFrom(me) : [];

  useEffect(() => {
    let active = true;
    setFailed(false);
    setMe(undefined);
    loadPanelMe(token).then(identity => {
      if (!active) return;
      setMe(identity);
      const homes = homesFrom(identity);
      setActiveHome(current => (current && homes.includes(current) ? current : defaultHome(identity)));
    }, error => {
      if (!active) return;
      if (error instanceof SessionEndedError) endSession();
      else setFailed(true);
    });
    return () => { active = false; };
  }, [token, retry, endSession]);

  return (
    <main className="workspace">
      <header className="bar">
        <strong>Fonitas</strong>
        <div className="actions">
          {available.length > 1 && (
            <select
              aria-label={t.roleSwitch}
              value={activeHome ?? ""}
              onChange={event => {
                const value = event.target.value;
                if (isWorkspaceHome(value)) setActiveHome(value);
              }}
            >
              {available.map(home => (
                <option key={home} value={home}>{t[homeLabel[home]]}</option>
              ))}
            </select>
          )}
          {menu}
          <button type="button" onClick={onSignOut}>{t.signOut}</button>
        </div>
      </header>

      {!me && !failed && <p role="status">{t.loading}</p>}
      {failed && (
        <div role="alert">
          <p className="error">{t.unavailable}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)}>{t.retry}</button>
        </div>
      )}
      {me && !activeHome && <p className="muted">{t.noRole}</p>}
      {me && activeHome === "admin" && <AdminHome t={t} displayName={me.display_name} />}
      {me && activeHome === "support" && <SupportHome t={t} displayName={me.display_name} />}
      {me && activeHome === "customer" && <CustomerHome t={t} displayName={me.display_name} />}
    </main>
  );
}
