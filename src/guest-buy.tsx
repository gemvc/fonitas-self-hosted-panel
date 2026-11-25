import type { ReactNode } from "react";
import type { messages } from "./locale";
import { BuySection } from "./pages/customer/sections";

type Text = typeof messages.en;

/** Public shop entry: no APP_END_USER session; sales stay open without registration. */
export function GuestBuy({
  t,
  menu,
  onBackToAuth,
}: {
  t: Text;
  menu: ReactNode;
  onBackToAuth: () => void;
}) {
  return (
    <div className="workspace">
      <header className="topbar">
        <strong>Fonitas</strong>
        <div className="actions">
          {menu}
          <button type="button" onClick={onBackToAuth}>{t.backToSignIn}</button>
        </div>
      </header>
      <main className="customer-main guest-buy">
        <p className="muted">{t.guestBuyIntro}</p>
        <BuySection t={t} />
      </main>
    </div>
  );
}
