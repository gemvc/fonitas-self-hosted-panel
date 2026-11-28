import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import type { messages } from "./locale";
import type { OemBranding } from "./oem-branding";
import { BuySection } from "./pages/customer/sections";

type Text = typeof messages.en;

/** Public shop entry: no APP_END_USER session; sales stay open without registration. */
export function GuestBuy({
  t,
  menu,
  branding,
  onBackToAuth,
}: {
  t: Text;
  menu: ReactNode;
  branding: OemBranding;
  onBackToAuth: () => void;
}) {
  return (
    <div className="workspace">
      <header className="topbar">
        <BrandMark branding={branding} />
        <div className="actions">
          {menu}
          <button type="button" onClick={onBackToAuth}>{t.backToSignIn}</button>
        </div>
      </header>
      <main className="customer-main guest-buy">
        <p className="muted">{t.guestBuyIntro}</p>
        <BuySection t={t} signedIn={false} />
      </main>
    </div>
  );
}
