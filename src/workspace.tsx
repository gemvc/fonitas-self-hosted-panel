import { useEffect, useState, type ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { EmailVerificationGate } from "./email-verification-gate";
import { isCustomerSection, type CustomerSection } from "./customer-nav";
import type { messages } from "./locale";
import type { OemBranding } from "./oem-branding";
import {
  loadPanelMe,
  rememberLocalMe,
  SessionEndedError,
  type PanelMe,
} from "./panel-me";
import { initialCustomerSection } from "./panel-return";
import { CustomerDashboard } from "./pages/customer-dashboard";
import { ProfileMenu } from "./profile-menu";
import { isCustomer } from "./roles";

type Text = typeof messages.en;

export function Workspace({
  token,
  endSession,
  onSignOut,
  onBrowseAsGuest,
  t,
  menu,
  branding,
  initialSection,
}: {
  token: string;
  endSession: () => void;
  onSignOut: () => void;
  onBrowseAsGuest: () => void;
  t: Text;
  menu: ReactNode;
  branding: OemBranding;
  initialSection?: CustomerSection;
}) {
  const [me, setMe] = useState<PanelMe>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [section, setSection] = useState<CustomerSection>(() =>
    initialSection && isCustomerSection(initialSection)
      ? initialSection
      : initialCustomerSection(),
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
  const verified = Boolean(me?.email_verified);

  function goToSection(next: CustomerSection) {
    setSection(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  function handleMeChange(next: PanelMe) {
    rememberLocalMe(next);
    setMe(next);
  }

  if (me && customer && !verified) {
    return (
      <EmailVerificationGate
        t={t}
        me={me}
        menu={menu}
        branding={branding}
        onVerified={handleMeChange}
        onBrowseAsGuest={onBrowseAsGuest}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <BrandMark branding={branding} />
        <div className="actions">
          {menu}
          {me && customer && verified && (
            <ProfileMenu
              t={t}
              displayName={me.display_name}
              onProfile={() => goToSection("profile")}
              onTicket={() => goToSection("support")}
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
        {me && customer && verified && (
          <CustomerDashboard
            t={t}
            me={me}
            onMeChange={handleMeChange}
            section={section}
            onSectionChange={goToSection}
          />
        )}
      </main>
    </div>
  );
}
