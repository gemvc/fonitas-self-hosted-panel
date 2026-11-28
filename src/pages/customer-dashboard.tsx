import { CUSTOMER_SECTIONS, type CustomerSection } from "../customer-nav";
import type { messages } from "../locale";
import type { PanelMe } from "../panel-me";
import {
  BillingSection,
  BuySection,
  LicensesSection,
  OverviewSection,
  ProfileSection,
  SubscriptionsSection,
  SupportSection,
} from "./customer/sections";

type Text = typeof messages.en;

const navLabel: Record<CustomerSection, keyof Text> = {
  overview: "navOverview",
  buy: "navBuy",
  licenses: "navLicenses",
  subscriptions: "navSubscriptions",
  billing: "navBilling",
  support: "navSupport",
  profile: "navProfile",
};

/** OEM customer dashboard for one published application on the developer’s subdomain. */
export function CustomerDashboard({
  t,
  me,
  onMeChange,
  section,
  onSectionChange,
}: {
  t: Text;
  me: PanelMe;
  onMeChange: (me: PanelMe) => void;
  section: CustomerSection;
  onSectionChange: (section: CustomerSection) => void;
}) {
  return (
    <div className="customer-shell">
      <aside className="customer-sidebar">
        <nav className="customer-nav" aria-label={t.customerNavLabel}>
          {CUSTOMER_SECTIONS.map(id => (
            <button
              key={id}
              type="button"
              className={section === id ? "nav-item active" : "nav-item"}
              aria-current={section === id ? "page" : undefined}
              onClick={() => onSectionChange(id)}
            >
              {t[navLabel[id]]}
            </button>
          ))}
        </nav>
      </aside>

      <div className="customer-main">
        {section === "overview" && <OverviewSection t={t} displayName={me.display_name} go={onSectionChange} />}
        {section === "buy" && (
          <BuySection
            t={t}
            buyerEmail={me.email ?? ""}
            signedIn
            onGoLicenses={() => onSectionChange("licenses")}
          />
        )}
        {section === "licenses" && <LicensesSection t={t} />}
        {section === "subscriptions" && <SubscriptionsSection t={t} go={onSectionChange} />}
        {section === "billing" && <BillingSection t={t} />}
        {section === "support" && <SupportSection t={t} />}
        {section === "profile" && <ProfileSection t={t} me={me} onMeChange={onMeChange} />}
      </div>
    </div>
  );
}
