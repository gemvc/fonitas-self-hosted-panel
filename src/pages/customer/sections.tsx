import { useEffect, useState, type FormEvent } from "react";
import { resolveBoundApplicationId } from "../../bound-application";
import { listBoundCatalogOffers } from "../../customer-catalog";
import {
  attachPurchase,
  isSubscriptionPurchase,
  listBoundPurchases,
  startCheckout,
  type BoundPurchase,
} from "../../customer-purchases";
import {
  formatCatalogOfferDisplay,
  parseAttachParams,
  parseCheckoutReturn,
  resolveAttachFields,
  type BoundCatalogListing,
} from "../../customer-binding";
import {
  closeTicket,
  createTicket,
  ensureSupportWorkspace,
  getTicket,
  isTicketClosed,
  listTicketMessages,
  listTickets,
  reopenTicket,
  replyToTicket,
  resolveTicket,
  viewerCanAssignTickets,
  type SupportMessage,
  type SupportTicket,
} from "../../customer-support";
import { customerApiBase, customerJson, CustomerApiError } from "../../customer-api";
import {
  IdentityApiError,
  resendEmailVerification,
  verificationCodePattern,
  verifyEmailByCode,
} from "../../identity-api";
import type { messages } from "../../locale";
import {
  clearVerificationEmailPending,
  isVerificationEmailPending,
  markVerificationEmailPending,
  updateLocalMe,
  type PanelMe,
} from "../../panel-me";
import { ActionRow, EmptyPanel, SectionFrame } from "./section-frame";

type Text = typeof messages.en;
type Go = (section: import("../../customer-nav").CustomerSection) => void;

function formatWait(seconds: number): string {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} min`;
  return `${seconds}s`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function validityLabel(t: Text, status: string | undefined): string {
  if (status === "EXPIRED") return t.validityExpired;
  if (status === "REVOKED") return t.validityRevoked;
  return t.validityActive;
}

function PurchaseRows({ t, purchases }: { t: Text; purchases: BoundPurchase[] }) {
  if (purchases.length === 0) return <EmptyPanel message={t.licensesEmpty} />;
  return (
    <ul className="applications">
      {purchases.map(p => {
        const snap = p.purchase_snapshot;
        return (
          <li key={p.id} className="bar">
            <div>
              <strong>{snap?.application_name || snap?.edition_id || p.id.slice(0, 8)}</strong>
              <span className="muted"> · {validityLabel(t, p.validity?.status || p.status)}</span>
            </div>
            <div className="muted">
              {snap?.runtime_term || snap?.billing_model || "—"}
              {snap?.seats != null ? ` · ${t.seatsLabel}: ${snap.seats}` : ""}
              {snap?.devices_per_seat != null ? ` · ${t.devicesPerSeat}: ${snap.devices_per_seat}` : ""}
            </div>
            <div className="muted">
              {t.runtimeUntil}: {formatDate(p.validity?.runtime_valid_until)}
              {" · "}
              {t.supportUntil}: {formatDate(p.validity?.support_valid_until)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OverviewSection({ t, displayName, go }: { t: Text; displayName: string; go: Go }) {
  const [licenses, setLicenses] = useState<number | null>(null);
  const [subs, setSubs] = useState<number | null>(null);
  const [tickets, setTickets] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const purchases = await listBoundPurchases();
        if (cancelled) return;
        setLicenses(purchases.length);
        setSubs(purchases.filter(isSubscriptionPurchase).length);
      } catch {
        if (!cancelled) {
          setLicenses(0);
          setSubs(0);
        }
      }
      try {
        const ws = await ensureSupportWorkspace();
        const list = await listTickets(ws);
        if (!cancelled) setTickets(list.length);
      } catch {
        if (!cancelled) setTickets(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="role-home">
      <p className="muted">{t.customerGreeting.replace("{name}", displayName)}</p>
      <h1>{t.navOverview}</h1>
      <p className="muted">{t.overviewIntro}</p>

      <div className="stat-grid">
        <button type="button" className="stat stat-link" onClick={() => go("licenses")}>
          <span className="muted">{t.navLicenses}</span>
          <span className="stat-value">{licenses == null ? "—" : String(licenses)}</span>
        </button>
        <button type="button" className="stat stat-link" onClick={() => go("subscriptions")}>
          <span className="muted">{t.navSubscriptions}</span>
          <span className="stat-value">{subs == null ? "—" : String(subs)}</span>
        </button>
        <button type="button" className="stat stat-link" onClick={() => go("billing")}>
          <span className="muted">{t.navBilling}</span>
          <span className="stat-value">{licenses == null ? "—" : String(licenses)}</span>
        </button>
        <button type="button" className="stat stat-link" onClick={() => go("support")}>
          <span className="muted">{t.navSupport}</span>
          <span className="stat-value">{tickets == null ? "—" : String(tickets)}</span>
        </button>
      </div>

      <ActionRow>
        <button type="button" className="primary" onClick={() => go("buy")}>{t.buyNow}</button>
        <button type="button" onClick={() => go("profile")}>{t.navProfile}</button>
      </ActionRow>
    </div>
  );
}

export function BuySection({
  t,
  buyerEmail = "",
  signedIn = false,
  onGoLicenses,
}: {
  t: Text;
  buyerEmail?: string;
  signedIn?: boolean;
  onGoLicenses?: () => void;
}) {
  const [listings, setListings] = useState<BoundCatalogListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [email, setEmail] = useState(buyerEmail);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);

  useEffect(() => {
    setEmail(buyerEmail);
  }, [buyerEmail]);

  useEffect(() => {
    const returned = parseCheckoutReturn(window.location.search);
    if (returned === "success") {
      setStatus(signedIn ? t.checkoutReturnSuccessSignedIn : t.checkoutReturnSuccessGuest);
    } else if (returned === "cancel") {
      setStatus(t.checkoutReturnCancel);
    }
    if (returned) {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, [signedIn, t.checkoutReturnCancel, t.checkoutReturnSuccessGuest, t.checkoutReturnSuccessSignedIn]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bound = await resolveBoundApplicationId();
        if (!bound) {
          if (!cancelled) {
            setListings([]);
            setError(t.bindingUnavailable);
          }
          return;
        }
        const data = await listBoundCatalogOffers();
        if (!cancelled) {
          setListings(data);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setListings([]);
          setError(t.loadFailed);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t.bindingUnavailable, t.loadFailed]);

  async function checkout(offerId: string) {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError(t.checkoutEmailInvalid);
      return;
    }
    setBusyOffer(offerId);
    setError(null);
    setStatus(null);
    try {
      const result = await startCheckout({ offerId, buyerEmail: trimmed });
      if (result.checkout_url) {
        window.location.assign(result.checkout_url);
        return;
      }
      // FREE / fulfilled without hosted URL.
      if (signedIn && onGoLicenses) {
        setStatus(t.checkoutFreeSignedIn);
        onGoLicenses();
        return;
      }
      setStatus(t.checkoutFreeGuest);
    } catch (cause) {
      if (cause instanceof CustomerApiError && cause.code === "PAYMENT_NOT_CONFIGURED") {
        setError(t.checkoutNotConfigured);
      } else {
        setError(t.checkoutFailed);
      }
    } finally {
      setBusyOffer(null);
    }
  }

  return (
    <SectionFrame title={t.navBuy} intro={t.buyIntro}>
      <label className="profile-form">
        {t.checkoutEmail}
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </label>
      {listings == null ? (
        <p className="muted">{t.loading}</p>
      ) : listings.length === 0 ? (
        <EmptyPanel message={t.buyEmpty} />
      ) : (
        <ul className="applications">
          {listings.flatMap(listing =>
            listing.offers.map(offer => {
              const display = formatCatalogOfferDisplay(listing, offer);
              return (
                <li key={offer.id} className="bar">
                  <div>
                    <strong>{display.title}</strong>
                    <span className="muted"> · {listing.name}</span>
                  </div>
                  <div className="muted">
                    {display.priceLabel}
                    {" · "}
                    {display.billingLabel}
                    {display.seatsLabel ? ` · ${t.seatsLabel}: ${display.seatsLabel}` : ""}
                    {display.platformsLabel ? ` · ${display.platformsLabel}` : ""}
                  </div>
                  <ActionRow>
                    <button
                      type="button"
                      className="primary"
                      disabled={busyOffer === offer.id}
                      onClick={() => void checkout(offer.id)}
                    >
                      {busyOffer === offer.id ? t.loading : t.offerCheckout}
                    </button>
                  </ActionRow>
                </li>
              );
            }),
          )}
        </ul>
      )}
      {status && <p role="status">{status}</p>}
      {status && status !== t.checkoutReturnCancel && (
        <p className="muted">{signedIn ? t.checkoutAttachHintSignedIn : t.checkoutAttachHintGuest}</p>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </SectionFrame>
  );
}

export function LicensesSection({ t }: { t: Text }) {
  const [purchases, setPurchases] = useState<BoundPurchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachMsg, setAttachMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const data = await listBoundPurchases();
    setPurchases(data);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
        if (!cancelled) setError(null);
      } catch {
        if (!cancelled) {
          setPurchases([]);
          setError(t.loadFailed);
        }
      }
      const fromUrl = parseAttachParams(window.location.search, window.location.hash);
      if (fromUrl && !cancelled) {
        setBusy(true);
        try {
          await attachPurchase(fromUrl.licenseId, fromUrl.signedUrl);
          await reload();
          setAttachMsg(t.attachLicenseSuccess);
          const url = new URL(window.location.href);
          url.searchParams.delete("license_id");
          url.searchParams.delete("signed_url");
          url.hash = "";
          window.history.replaceState({}, "", url.pathname + url.search);
        } catch {
          setAttachMsg(t.attachLicenseFailed);
        } finally {
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t.attachLicenseFailed, t.attachLicenseSuccess, t.loadFailed]);

  async function onAttach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const parsed = resolveAttachFields(
      String(fd.get("license_id") ?? ""),
      String(fd.get("signed_url") ?? ""),
    );
    if (!parsed) {
      setAttachMsg(t.attachLicenseFailed);
      return;
    }
    setBusy(true);
    setAttachMsg(null);
    try {
      await attachPurchase(parsed.licenseId, parsed.signedUrl);
      await reload();
      setAttachMsg(t.attachLicenseSuccess);
      event.currentTarget.reset();
    } catch {
      setAttachMsg(t.attachLicenseFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionFrame title={t.navLicenses} intro={t.licensesIntro}>
      {purchases == null ? <p className="muted">{t.loading}</p> : <PurchaseRows t={t} purchases={purchases} />}
      {error && <p role="alert" className="error">{error}</p>}

      <section className="panel-section">
        <h2>{t.attachLicense}</h2>
        <p className="muted">{t.attachLicenseIntro}</p>
        <form className="profile-form" onSubmit={event => void onAttach(event)}>
          <label>{t.licenseIdLabel}
            <input name="license_id" required disabled={busy} />
          </label>
          <label>{t.signedUrlLabel}
            <input name="signed_url" type="url" required disabled={busy} />
          </label>
          <button type="submit" className="primary" disabled={busy}>{busy ? t.loading : t.attachLicense}</button>
        </form>
        {attachMsg && <p role="status">{attachMsg}</p>}
      </section>

      <section className="panel-section">
        <h2>{t.licenseKindsTitle}</h2>
        <dl className="detail-list">
          <div><dt>{t.licenseKindPerpetual}</dt><dd>{t.licenseKindPerpetualHint}</dd></div>
          <div><dt>{t.licenseKindSubscription}</dt><dd>{t.licenseKindSubscriptionHint}</dd></div>
          <div><dt>{t.licenseKindDevice}</dt><dd>{t.licenseKindDeviceHint}</dd></div>
          <div><dt>{t.licenseKindMultiDevice}</dt><dd>{t.licenseKindMultiDeviceHint}</dd></div>
        </dl>
      </section>

      <section className="panel-section">
        <h2>{t.devicesHeading}</h2>
        <p className="muted">{t.devicesIntro}</p>
        <EmptyPanel message={t.devicesEmpty} />
        <p className="muted">{t.devicesUnavailable}</p>
        <ActionRow>
          <button type="button" className="primary" disabled>{t.registerDevice}</button>
          <button type="button" disabled>{t.removeDevice}</button>
        </ActionRow>
      </section>
    </SectionFrame>
  );
}

export function SubscriptionsSection({ t, go }: { t: Text; go: Go }) {
  const [purchases, setPurchases] = useState<BoundPurchase[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await listBoundPurchases();
        if (!cancelled) setPurchases(all.filter(isSubscriptionPurchase));
      } catch {
        if (!cancelled) setPurchases([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionFrame title={t.navSubscriptions} intro={t.subscriptionsIntro}>
      {purchases == null ? (
        <p className="muted">{t.loading}</p>
      ) : purchases.length === 0 ? (
        <EmptyPanel message={t.subscriptionsEmpty} />
      ) : (
        <PurchaseRows t={t} purchases={purchases} />
      )}
      <ActionRow>
        <button type="button" className="primary" onClick={() => go("buy")}>{t.registerSubscription}</button>
        <button type="button" disabled title={t.cancelUnavailable}>{t.cancelSubscription}</button>
      </ActionRow>
      <p className="muted">{t.cancelUnavailable}</p>
    </SectionFrame>
  );
}

export function BillingSection({ t }: { t: Text }) {
  const [purchases, setPurchases] = useState<BoundPurchase[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await listBoundPurchases();
        if (!cancelled) setPurchases(all);
      } catch {
        if (!cancelled) setPurchases([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionFrame title={t.navBilling} intro={t.billingIntro}>
      <section className="panel-section">
        <h2>{t.purchasesHeading}</h2>
        <p className="muted">{t.purchasesIntro}</p>
        {purchases == null ? (
          <p className="muted">{t.loading}</p>
        ) : purchases.length === 0 ? (
          <EmptyPanel message={t.purchasesEmpty} />
        ) : (
          <PurchaseRows t={t} purchases={purchases} />
        )}
      </section>
      <section className="panel-section">
        <h2>{t.paymentsHeading}</h2>
        <p className="muted">{t.paymentsIntro}</p>
        <EmptyPanel message={t.paymentsEmpty} />
        <p className="muted">{t.paymentMethodsUnavailable}</p>
      </section>
    </SectionFrame>
  );
}

export function SupportSection({ t }: { t: Text }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refreshList(id: string) {
    const list = await listTickets(id);
    setTickets(list);
    return list;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = await ensureSupportWorkspace();
        if (cancelled) return;
        setWorkspaceId(id);
        await refreshList(id);
        if (!cancelled) setError(null);
        const agent = await viewerCanAssignTickets();
        if (!cancelled) setCanAssign(agent);
      } catch {
        if (!cancelled) {
          setTickets([]);
          setError(t.supportWorkspaceUnavailable);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t.supportWorkspaceUnavailable]);

  async function openTicket(ticketId: string) {
    setBusy(true);
    setError(null);
    try {
      const [ticket, thread] = await Promise.all([
        getTicket(ticketId),
        listTicketMessages(ticketId),
      ]);
      setSelected(ticket);
      setMessages(thread);
      setTickets(prev => (prev ?? []).map(row => (row.public_id === ticket.public_id ? ticket : row)));
    } catch {
      setMessages([]);
      setError(t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return;
    const fd = new FormData(event.currentTarget);
    const subject = String(fd.get("subject") ?? "").trim();
    const category = String(fd.get("category") ?? "general").trim() || "general";
    const priority = String(fd.get("priority") ?? "NORMAL").trim() || "NORMAL";
    if (!subject) return;
    setBusy(true);
    setError(null);
    try {
      const ticket = await createTicket(workspaceId, { subject, category, priority });
      setTickets(prev => [ticket, ...(prev ?? [])]);
      event.currentTarget.reset();
      await openTicket(ticket.public_id);
    } catch {
      setError(t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || isTicketClosed(selected.status)) return;
    const fd = new FormData(event.currentTarget);
    const message = String(fd.get("message") ?? "").trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    try {
      await replyToTicket(selected.public_id, message);
      await openTicket(selected.public_id);
      event.currentTarget.reset();
    } catch {
      setError(t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function runAgentAction(action: "resolve" | "close" | "reopen") {
    if (!selected || !canAssign) return;
    setBusy(true);
    setError(null);
    try {
      const next = action === "resolve"
        ? await resolveTicket(selected.public_id)
        : action === "close"
          ? await closeTicket(selected.public_id)
          : await reopenTicket(selected.public_id);
      setSelected(next);
      if (workspaceId) await refreshList(workspaceId);
      const thread = await listTicketMessages(next.public_id);
      setMessages(thread);
    } catch {
      setError(t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  const closed = selected ? isTicketClosed(selected.status) : false;
  const canReply = Boolean(selected) && !closed;

  return (
    <SectionFrame title={t.navSupport} intro={t.ticketsIntro}>
      {error && <p role="alert" className="error">{error}</p>}
      {tickets == null ? (
        <p className="muted">{t.loading}</p>
      ) : tickets.length === 0 ? (
        <EmptyPanel message={t.ticketsEmpty} />
      ) : (
        <ul className="applications">
          {tickets.map(ticket => (
            <li key={ticket.public_id} className="bar">
              <button type="button" className="stat-link" onClick={() => void openTicket(ticket.public_id)}>
                <strong>{ticket.subject}</strong>
                <span className="muted">
                  {" · "}{ticket.status}
                  {ticket.priority ? ` · ${ticket.priority}` : ""}
                  {" · "}{formatDate(ticket.updated_at || ticket.created_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <section className="panel-section">
          <h2>{selected.subject}</h2>
          <p className="muted">
            {selected.status}
            {selected.priority ? ` · ${t.ticketPriority}: ${selected.priority}` : ""}
            {" · "}{formatDate(selected.created_at)}
          </p>
          <ul className="applications">
            {messages.length === 0 ? (
              <li className="bar muted"><span>{t.ticketThreadEmpty}</span></li>
            ) : messages.map(m => (
              <li key={m.public_id} className="bar">
                <span className="muted">{m.message_type} · {formatDate(m.created_at)}</span>
                <div>{m.message}</div>
              </li>
            ))}
          </ul>
          {canReply && (
            <form className="profile-form" onSubmit={event => void onReply(event)}>
              <label>{t.ticketReply}
                <textarea name="message" required disabled={busy} rows={3} />
              </label>
              <button type="submit" className="primary" disabled={busy}>{t.ticketSendReply}</button>
            </form>
          )}
          {closed && !canAssign && <p className="muted">{t.ticketClosedHint}</p>}
          {canAssign && (
            <ActionRow>
              {!closed && (
                <>
                  <button type="button" disabled={busy} onClick={() => void runAgentAction("resolve")}>
                    {t.ticketResolve}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void runAgentAction("close")}>
                    {t.ticketClose}
                  </button>
                </>
              )}
              {closed && (
                <button type="button" className="primary" disabled={busy} onClick={() => void runAgentAction("reopen")}>
                  {t.ticketReopen}
                </button>
              )}
            </ActionRow>
          )}
        </section>
      )}

      <section className="panel-section">
        <h2>{t.newTicket}</h2>
        <form className="profile-form" onSubmit={event => void onCreate(event)}>
          <label>{t.ticketSubject}
            <input name="subject" required disabled={busy || !workspaceId} />
          </label>
          <label>{t.ticketCategory}
            <input name="category" defaultValue="general" disabled={busy || !workspaceId} />
          </label>
          <label>{t.ticketPriority}
            <select name="priority" defaultValue="NORMAL" disabled={busy || !workspaceId}>
              <option value="LOW">LOW</option>
              <option value="NORMAL">NORMAL</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
          </label>
          <button type="submit" className="primary" disabled={busy || !workspaceId}>
            {t.newTicket}
          </button>
        </form>
      </section>
    </SectionFrame>
  );
}

export function ProfileSection({
  t,
  me,
  onMeChange,
}: {
  t: Text;
  me: PanelMe;
  onMeChange: (me: PanelMe) => void;
}) {
  const email = me.email ?? "";
  const [verified, setVerified] = useState(Boolean(me.email_verified));
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<
    "verifyFailed" | "verifyInvalid" | "rateLimited" | "unavailable" | "missingEmail" | "validation" | null
  >(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [fullName, setFullName] = useState(me.display_name);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const helpSpace = String(import.meta.env?.VITE_HELP_SPACE_SLUG ?? "").trim();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await customerJson<{ data?: { full_name?: string } }>("/auth/personal-profile");
        if (!cancelled && body.data?.full_name) setFullName(body.data.full_name);
      } catch {
        /* profile may not exist yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldownUntil <= 0) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left <= 0) setCooldownUntil(0);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function mapIdentityError(cause: unknown): typeof error {
    if (cause instanceof IdentityApiError) {
      if (cause.message === "rate_limited") {
        setCooldownUntil(Date.now() + (cause.retryAfterSeconds ?? 60) * 1000);
        return "rateLimited";
      }
      if (cause.message === "validation") return "validation";
    }
    return "unavailable";
  }

  async function sendCode() {
    if (busy || verified || cooldownLeft > 0) return;
    if (!email) {
      setError("missingEmail");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resendEmailVerification(email);
      setCodeSent(true);
      markVerificationEmailPending();
    } catch (cause) {
      setError(mapIdentityError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || verified) return;
    if (!email) {
      setError("missingEmail");
      return;
    }
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    if (!verificationCodePattern.test(code)) {
      setError("verifyInvalid");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyEmailByCode(email, code);
      if (!ok) {
        setError("verifyFailed");
        return;
      }
      setVerified(true);
      clearVerificationEmailPending();
      const next = updateLocalMe({ email_verified: true }) ?? { ...me, email_verified: true };
      onMeChange(next);
      event.currentTarget.reset();
    } catch (cause) {
      setError(mapIdentityError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fullName.trim();
    if (!name) return;
    setBusy(true);
    setProfileStatus(null);
    try {
      await customerJson("/auth/personal-profile", {
        method: "PUT",
        body: JSON.stringify({ full_name: name }),
      });
      const next = updateLocalMe({ display_name: name }) ?? { ...me, display_name: name };
      onMeChange(next);
      setProfileStatus(t.profileSaved);
    } catch (cause) {
      setProfileStatus(cause instanceof CustomerApiError ? t.profileSaveFailed : t.profileSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  const sendLabel = busy
    ? t.loading
    : cooldownLeft > 0
      ? t.rateLimitedWait.replace("{wait}", formatWait(cooldownLeft))
      : codeSent
        ? t.resendVerificationCode
        : t.sendVerificationCode;
  const errorText = error === "rateLimited" && cooldownLeft > 0
    ? t.rateLimitedWait.replace("{wait}", formatWait(cooldownLeft))
    : error
      ? t[error]
      : null;

  return (
    <SectionFrame title={t.navProfile} intro={t.profileIntro}>
      <section className="panel-section">
        <h2>{t.profileAccountHeading}</h2>
        <form className="profile-form" onSubmit={event => void saveProfile(event)}>
          <label>{t.fullName}
            <input value={fullName} onChange={e => setFullName(e.target.value)} required disabled={busy} />
          </label>
          <dl className="detail-list profile-list">
            <div>
              <dt>{t.email}</dt>
              <dd className="email-status">
                <span>{email || "—"}</span>
                {verified ? (
                  <span className="verified-badge" role="status">
                    <span className="verified-check" aria-hidden="true">✓</span>
                    {t.emailVerified}
                  </span>
                ) : (
                  <span className="muted">{t.emailUnverified}</span>
                )}
              </dd>
            </div>
          </dl>
          <ActionRow>
            <button type="submit" className="primary" disabled={busy}>{t.saveProfile}</button>
          </ActionRow>
        </form>
        {profileStatus && <p role="status">{profileStatus}</p>}
      </section>

      <section className="panel-section">
        <h2>{t.verifyEmailHeading}</h2>
        {verified ? (
          <p className="verified-line" role="status">
            <span className="verified-check" aria-hidden="true">✓</span>
            {t.emailVerifiedMessage}
          </p>
        ) : (
          <>
            <p className="muted">{t.verifyEmailIntro}</p>
            {(isVerificationEmailPending() || codeSent) && (
              <p role="status">{codeSent ? t.verificationEmailSent : t.verificationRegisterHint}</p>
            )}
            <ActionRow>
              <button
                type="button"
                className="primary"
                onClick={() => void sendCode()}
                disabled={!email || busy || cooldownLeft > 0}
              >
                {sendLabel}
              </button>
            </ActionRow>
            <form className="profile-form" onSubmit={event => void submitCode(event)}>
              <label>{t.verificationCode}
                <input
                  name="code"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={8}
                  minLength={8}
                  pattern="(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8}"
                  dir="ltr"
                  required
                  disabled={busy}
                />
              </label>
              <p className="muted">{t.verificationCodeHint}</p>
              <button type="submit" className="primary" disabled={!email || busy}>{t.submitVerificationCode}</button>
            </form>
            {errorText && <p role="alert" className="error">{errorText}</p>}
          </>
        )}
      </section>

      <section className="panel-section">
        <h2>{t.changePassword}</h2>
        <p className="muted">{t.changePasswordIntro}</p>
        <form className="profile-form" onSubmit={event => event.preventDefault()}>
          <label>{t.currentPassword}
            <input type="password" autoComplete="current-password" disabled />
          </label>
          <label>{t.newPassword}
            <input type="password" autoComplete="new-password" disabled />
          </label>
          <label>{t.confirmPassword}
            <input type="password" autoComplete="new-password" disabled />
          </label>
          <button type="submit" className="primary" disabled>{t.changePassword}</button>
        </form>
      </section>

      {helpSpace && (
        <section className="panel-section">
          <h2>{t.helpHeading}</h2>
          <p className="muted">{t.helpIntro}</p>
          <ActionRow>
            <a
              className="primary"
              href={`${customerApiBase}/help/public/${encodeURIComponent(helpSpace)}/home`}
              target="_blank"
              rel="noreferrer"
            >
              {t.helpOpen}
            </a>
          </ActionRow>
        </section>
      )}

      <section className="panel-section">
        <h2>{t.paymentMethodsHeading}</h2>
        <p className="muted">{t.paymentMethodsIntro}</p>
        <EmptyPanel message={t.paymentMethodsEmpty} />
        <p className="muted">{t.paymentMethodsUnavailable}</p>
        <ActionRow>
          <button type="button" className="primary" disabled>{t.addPaymentMethod}</button>
        </ActionRow>
      </section>

      <section className="panel-section">
        <h2>{t.emailHeading}</h2>
        <p className="muted">{t.emailIntro}</p>
        <EmptyPanel message={t.emailEmpty} />
      </section>
    </SectionFrame>
  );
}
