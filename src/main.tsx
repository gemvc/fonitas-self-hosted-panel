import { StrictMode, useCallback, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { messages, type Language } from "./locale";
import { completePanelSignIn, panelRequest, startPanelSignIn, type PanelSession } from "./panel-login";
import { isAllowedPanelOrigin } from "./origin";
import { setPreviewMe } from "./panel-me";
import { CUSTOMER_ROLE } from "./roles";
import { Workspace } from "./workspace";
import "./styles.css";

const hostedSettings = "https://developerpannel.fonitas.com/settings/custom-domains";
const allowedOrigin = isAllowedPanelOrigin();
let pendingSession = completePanelSignIn();
void pendingSession?.catch(() => {});

type Text = typeof messages.en;
type PairingError = "invalidKey" | "rejectedKey" | "unavailable";
type SignOutState = { status: "pending" | "failed"; token: string } | { status: "done" };

function defaultLanguage(): Language {
  const preferred = localStorage.getItem("fonitas-panel-language") ?? navigator.language.split("-")[0];
  return preferred === "fa" || preferred === "ar" ? preferred : "en";
}

function Panel() {
  const [language, setLanguage] = useState(defaultLanguage);
  const [session, setSession] = useState<PanelSession | null>(null);
  const [checking, setChecking] = useState(pendingSession !== null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const [signOutState, setSignOutState] = useState<SignOutState>();
  const endSession = useCallback(() => {
    setPreviewMe(null);
    setSession(null);
  }, []);
  const t = messages[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "en" ? "ltr" : "rtl";
    localStorage.setItem("fonitas-panel-language", language);
  }, [language]);

  useEffect(() => {
    if (!pendingSession) return;
    let active = true;
    pendingSession.then(value => { if (active) setSession(value); }, () => {
      if (active) setSignInFailed(true);
    }).finally(() => {
      if (active) {
        pendingSession = null;
        setChecking(false);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const timeout = window.setTimeout(endSession, session.expires_in * 1000);
    return () => window.clearTimeout(timeout);
  }, [session, endSession]);

  function signIn() {
    setSigningIn(true);
    setSignInFailed(false);
    void startPanelSignIn().catch(() => { setSigningIn(false); setSignInFailed(true); });
  }

  async function signOut(token: string) {
    const preview = import.meta.env.DEV && token === "preview";
    endSession();
    if (preview) {
      setSignOutState({ status: "done" });
      return;
    }
    setSignOutState({ status: "pending", token });
    try {
      const response = await panelRequest("/session", {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
        keepalive: true,
      });
      if (response.status !== 204) throw new Error("Session revocation was not confirmed");
      setSignOutState({ status: "done" });
    } catch {
      setSignOutState({ status: "failed", token });
    }
  }

  function previewCustomer() {
    setSignInFailed(false);
    setSignOutState(undefined);
    setPreviewMe({
      display_name: "Preview customer",
      roles: [CUSTOMER_ROLE],
      permissions: [],
    });
    setSession({ access_token: "preview", expires_in: 3_600 });
  }

  const languageMenu = (
    <select aria-label={language === "fa" ? "زبان" : language === "ar" ? "اللغة" : "Language"}
      value={language} onChange={event => setLanguage(event.target.value as Language)}>
      <option value="en">English</option>
      <option value="fa">فارسی</option>
      <option value="ar">العربية</option>
    </select>
  );

  if (checking) return <main className="setup" role="status">{t.loading}</main>;
  if (session) return <Workspace token={session.access_token} endSession={endSession} t={t} menu={languageMenu}
    onSignOut={() => void signOut(session.access_token)} />;

  return (
    <main className="setup">
      <section className="card">
        <header className="bar"><strong>Fonitas</strong>{languageMenu}</header>
        {signOutState?.status === "pending" && <p role="status">{t.signingOut}</p>}
        {signOutState?.status === "done" && <div role="status">
          <p>{t.signedOut}</p>
          <p className="muted">{t.fonitasSession}</p>
        </div>}
        {signOutState?.status === "failed" && <div>
          <p role="alert" className="error">{t.signOutFailed}</p>
          <button type="button" onClick={() => void signOut(signOutState.token)}>{t.retrySignOut}</button>
        </div>}
        {allowedOrigin && <button className="primary full" type="button" onClick={signIn}
          disabled={signingIn || signOutState?.status === "pending"}>{t.signIn}</button>}
        {signInFailed && <p role="alert" className="error">{t.signInFailed}</p>}
        <Pairing t={t} />
        {import.meta.env.DEV && (
          <section className="preview-roles">
            <p className="muted">{t.previewRoles}</p>
            <div className="actions">
              <button type="button" onClick={previewCustomer}>{t.roleCustomer}</button>
            </div>
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
