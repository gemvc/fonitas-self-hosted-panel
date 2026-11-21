import { useEffect, useState, type ReactNode } from "react";
import type { messages } from "./locale";
import { loadPanelMe, SessionEndedError, type PanelMe } from "./panel-me";
import { AdminHome } from "./pages/admin-home";
import { CustomerHome } from "./pages/customer-home";
import { SupportHome } from "./pages/support-home";
import { defaultRole, isKnownRole, knownRolesFrom, type KnownRoleKey } from "./roles";

type Text = typeof messages.en;

const roleLabel: Record<KnownRoleKey, keyof Text> = {
  application_admin: "roleAdmin",
  application_support: "roleSupport",
  application_customer: "roleCustomer",
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
  const [activeRole, setActiveRole] = useState<KnownRoleKey | null>(null);
  const available = me ? knownRolesFrom(me.roles) : [];

  useEffect(() => {
    let active = true;
    setFailed(false);
    setMe(undefined);
    loadPanelMe(token).then(identity => {
      if (!active) return;
      setMe(identity);
      setActiveRole(current => {
        if (current && identity.roles.includes(current)) return current;
        return defaultRole(identity.roles);
      });
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
              value={activeRole ?? ""}
              onChange={event => {
                const value = event.target.value;
                if (isKnownRole(value)) setActiveRole(value);
              }}
            >
              {available.map(role => (
                <option key={role} value={role}>{t[roleLabel[role]]}</option>
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
      {me && !activeRole && <p className="muted">{t.noRole}</p>}
      {me && activeRole === "application_admin" && <AdminHome t={t} displayName={me.display_name} />}
      {me && activeRole === "application_support" && <SupportHome t={t} displayName={me.display_name} />}
      {me && activeRole === "application_customer" && <CustomerHome t={t} displayName={me.display_name} />}
    </main>
  );
}
