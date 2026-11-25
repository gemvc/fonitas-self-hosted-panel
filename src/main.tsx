import { StrictMode, useCallback, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { createLocalCustomerSession, isLocalCustomerToken } from "./customer-session";
import { GuestBuy } from "./guest-buy";
import { IdentityApiError, registerIdentityUser } from "./identity-api";
import { messages, type Language } from "./locale";
import { clearLocalMe, markVerificationEmailPending, rememberLocalMe } from "./panel-me";
import { panelRequest, type PanelSession } from "./panel-login";
import { isAllowedPanelOrigin } from "./origin";
import { Workspace } from "./workspace";
import "./styles.css";

const hostedSettings = "https://developerpannel.fonitas.com/settings/custom-domains";
const allowedOrigin = isAllowedPanelOrigin();
const setupPairing = new URLSearchParams(window.location.search).get("setup") === "1";

type Text = typeof messages.en;
type AuthMode = "sign-in" | "register";
type PairingError = "invalidKey" | "rejectedKey" | "unavailable";
type AuthError =
  | "authFailed"
  | "passwordMismatch"
  | "unavailable"
  | "emailTaken"
  | "registerFailed"
  | "registerInvalid"
  | "tenantUnavailable";

function defaultLanguage(): Language {
  const preferred = localStorage.getItem("fonitas-panel-language") ?? navigator.language.split("-")[0];
  return preferred === "fa" || preferred === "ar" ? preferred : "en";
}

function Panel() {
  const [language, setLanguage] = useState(defaultLanguage);
  const [session, setSession] = useState<PanelSession | null>(null);
  const [guestBrowse, setGuestBrowse] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const endSession = useCallback(() => {
    clearLocalMe();
    setSession(null);
  }, []);
  const t = messages[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "en" ? "ltr" : "rtl";
    localStorage.setItem("fonitas-panel-language", language);
  }, [language]);

  useEffect(() => {
    if (!session) return;
    const timeout = window.setTimeout(endSession, session.expires_in * 1000);
    return () => window.clearTimeout(timeout);
  }, [session, endSession]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const confirm = String(form.get("confirm") ?? "");

    if (!email || !password) {
      setAuthError("authFailed");
      return;
    }
    if (authMode === "register" && password !== confirm) {
      setAuthError("passwordMismatch");
      return;
    }

    setAuthError(null);
    setBusy(true);
    setSignedOut(false);
    try {
      const displayName = authMode === "register" && name ? name : email.split("@")[0] || email;
      let verified = false;
      if (authMode === "register") {
        // Creates the Identity user and dispatches the verification email on Fonitas.
        const registered = await registerIdentityUser({ displayName, email, password });
        verified = registered.email_verified;
        if (!verified) markVerificationEmailPending();
      }
      const next = createLocalCustomerSession(displayName, email);
      if (verified) next.me.email_verified = true;
      rememberLocalMe(next.me);
      setGuestBrowse(false);
      setSession({ access_token: next.access_token, expires_in: next.expires_in });
      event.currentTarget.reset();
    } catch (cause) {
      if (cause instanceof IdentityApiError) {
        if (cause.message === "email_taken") setAuthError("emailTaken");
        else if (cause.message === "validation") setAuthError("registerInvalid");
        else if (cause.message === "register_failed") setAuthError("registerFailed");
        else if (cause.message === "tenant_unavailable") setAuthError("tenantUnavailable");
        else setAuthError("unavailable");
      } else {
        setAuthError("unavailable");
      }
    } finally {
      setBusy(false);
    }
  }

  function signOut(token: string) {
    endSession();
    setSignedOut(true);
    if (isLocalCustomerToken(token)) return;
    void panelRequest("/session", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      keepalive: true,
    }).catch(() => {});
  }

  const languageMenu = (
    <select aria-label={language === "fa" ? "زبان" : language === "ar" ? "اللغة" : "Language"}
      value={language} onChange={event => setLanguage(event.target.value as Language)}>
      <option value="en">English</option>
      <option value="fa">فارسی</option>
      <option value="ar">العربية</option>
    </select>
  );

  if (session) {
    return (
      <Workspace
        token={session.access_token}
        endSession={endSession}
        t={t}
        menu={languageMenu}
        onSignOut={() => signOut(session.access_token)}
      />
    );
  }

  if (guestBrowse && !setupPairing) {
    return (
      <GuestBuy
        t={t}
        menu={languageMenu}
        onBackToAuth={() => setGuestBrowse(false)}
      />
    );
  }

  return (
    <main className="setup">
      <section className="card">
        <header className="bar"><strong>Fonitas</strong>{languageMenu}</header>
        {signedOut && <p role="status">{t.signedOut}</p>}

        {setupPairing ? (
          <Pairing t={t} />
        ) : (
          <section className="auth">
            <h1>{t.welcomeTitle}</h1>
            <p className="muted">{t.welcomeIntro}</p>
            <div className="auth-tabs" role="tablist" aria-label={t.welcomeTitle}>
              <button type="button" role="tab" aria-selected={authMode === "sign-in"}
                className={authMode === "sign-in" ? "primary" : undefined}
                onClick={() => { setAuthMode("sign-in"); setAuthError(null); }}>{t.signIn}</button>
              <button type="button" role="tab" aria-selected={authMode === "register"}
                className={authMode === "register" ? "primary" : undefined}
                onClick={() => { setAuthMode("register"); setAuthError(null); }}>{t.register}</button>
            </div>
            <form onSubmit={event => void submitAuth(event)}>
              {authMode === "register" && (
                <label>{t.name}
                  <input name="name" type="text" autoComplete="name" required disabled={busy} />
                </label>
              )}
              <label>{t.email}
                <input name="email" type="email" dir="ltr" autoComplete="email" required disabled={busy} />
              </label>
              <label>{t.password}
                <input name="password" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  required minLength={8} disabled={busy} />
              </label>
              {authMode === "register" && (
                <label>{t.confirmPassword}
                  <input name="confirm" type="password" autoComplete="new-password" required minLength={8} disabled={busy} />
                </label>
              )}
              {authError && <p role="alert" className="error">{t[authError]}</p>}
              <button className="primary full" disabled={busy}>
                {busy ? t.loading : authMode === "register" ? t.register : t.signIn}
              </button>
            </form>
            <button
              type="button"
              className="full"
              disabled={busy}
              onClick={() => { setAuthError(null); setGuestBrowse(true); }}
            >
              {t.continueWithoutAccount}
            </button>
          </section>
        )}
      </section>
    </main>
  );
}

function Pairing({ t }: { t: Text }) {
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<PairingError | null>(null);

  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowedOrigin || busy) return;
    const key = String(new FormData(event.currentTarget).get("key") ?? "").trim();
    if (!/^fpk_[0-9a-f]{64}$/.test(key)) {
      setError("invalidKey");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const response = await panelRequest("/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_key: key }),
      });
      if (response.status === 204) setConnected(true);
      else setError(response.status === 401 || response.status === 422 ? "rejectedKey" : "unavailable");
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pairing">
      <h1>{t.connect}</h1>
      <p className="muted">{t.setup}</p>
      <p className="origin"><bdi>{window.location.origin}</bdi></p>
      {connected ? (
        <p role="status">{t.connected}</p>
      ) : allowedOrigin ? (
        <form onSubmit={pair}>
          <label>{t.key}
            <input name="key" type="password" dir="ltr" autoComplete="off" spellCheck={false} required disabled={busy} />
          </label>
          {error && <p role="alert" className="error">{t[error]}</p>}
          <button className="full" disabled={busy}>{busy ? t.loading : t.submit}</button>
        </form>
      ) : <p role="alert" className="error">{t.https}</p>}
      <a href={hostedSettings} target="_blank" rel="noopener noreferrer">{connected ? t.manage : t.getKey}</a>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Panel /></StrictMode>);
