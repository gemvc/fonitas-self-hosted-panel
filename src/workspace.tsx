import { useEffect, useState, type ReactNode } from "react";
import type { CustomerSection } from "./customer-nav";
import type { messages } from "./locale";
import {
  isVerificationEmailPending,
  loadPanelMe,
  rememberLocalMe,
  SessionEndedError,
  type PanelMe,
} from "./panel-me";
import { CustomerDashboard } from "./pages/customer-dashboard";
import { ProfileMenu } from "./profile-menu";
import { isCustomer } from "./roles";

type Text = typeof messages.en;

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
  // After register, Identity already emailed a code — open Profile to enter it.
  const [section, setSection] = useState<CustomerSection>(
    () => (isVerificationEmailPending() ? "profile" : "overview"),
  );

  useEffect(() => {
    let active = true;
    setFailed(false);
    setMe(undefined);
    loadPanelMe(token).then(identity => {
      if (active) setMe(identity);
    }, error => {
      if (!active) return;
      if (error instanceof SessionEndedError) endSession();
      else setFailed(true);
    });
    return () => { active = false; };
  }, [token, retry, endSession]);

  const customer = me ? isCustomer(me.roles) : false;

  function handleMeChange(next: PanelMe) {
    rememberLocalMe(next);
    setMe(next);
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <strong>Fonitas</strong>
        <div className="actions">
          {menu}
          {me && customer && (
            <ProfileMenu
              t={t}
              displayName={me.display_name}
              onProfile={() => setSection("profile")}
              onTicket={() => setSection("support")}
              onSignOut={onSignOut}
            />
          )}
        </div>
      </header>

      <main>
        {!me && !failed && <p role="status">{t.loading}</p>}
        {failed && (
          <div role="alert">
            <p className="error">{t.unavailable}</p>
            <button type="button" onClick={() => setRetry(value => value + 1)}>{t.retry}</button>
          </div>
        )}
        {me && !customer && <p className="muted">{t.noRole}</p>}
        {me && customer && (
          <CustomerDashboard
            t={t}
            me={me}
            onMeChange={handleMeChange}
            section={section}
            onSectionChange={setSection}
          />
        )}
      </main>
    </div>
  );
}
