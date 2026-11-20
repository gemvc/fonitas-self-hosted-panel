import { StrictMode, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { messages, type Language } from "./locale";
import { completePanelSignIn, panelRequest, startPanelSignIn, type PanelSession } from "./panel-login";
import "./styles.css";

const hostedSettings = "https://developerpannel.fonitas.com/settings/custom-domains";
const secure = window.location.protocol === "https:";
const pendingSession = completePanelSignIn();
void pendingSession?.catch(() => {});

type Text = typeof messages.en;
type AppPage = {
  organization: string;
  applications: { public_id: string; name: string; slug: string; status: string }[];
  page: number;
  last_page: number;
};
type PairingError = "invalidKey" | "rejectedKey" | "unavailable";

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
  const endSession = useCallback(() => setSession(null), []);
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
    }).finally(() => { if (active) setChecking(false); });
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

  const languageMenu = (
    <select aria-label={language === "fa" ? "زبان" : language === "ar" ? "اللغة" : "Language"}
      value={language} onChange={event => setLanguage(event.target.value as Language)}>
      <option value="en">English</option>
      <option value="fa">فارسی</option>
      <option value="ar">العربية</option>
    </select>
  );

  if (checking) return <main className="setup" role="status">{t.loading}</main>;
  if (session) return <Applications token={session.access_token} endSession={endSession} t={t} menu={languageMenu} />;

  return (
    <main className="setup">
      <section className="card">
        <header className="bar"><strong>Fonitas</strong>{languageMenu}</header>
        {secure && <button className="primary full" type="button" onClick={signIn} disabled={signingIn}>{t.signIn}</button>}
        {signInFailed && <p role="alert" className="error">{t.signInFailed}</p>}
        <Pairing t={t} />
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
    if (!secure || busy) return;
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
      ) : secure ? (
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

function Applications({ token, endSession, t, menu }: { token: string; endSession: () => void; t: Text; menu: ReactNode }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AppPage>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    panelRequest("/session/applications?" + new URLSearchParams({ page: String(page) }), {
      headers: { Authorization: "Bearer " + token },
    }).then(async response => {
      if (!active) return;
      if ([401, 403, 404].includes(response.status)) { endSession(); return; }
      if (!response.ok) throw new Error("Failed to load applications");
      const { data } = await response.json() as { data: AppPage };
      if (active) setData(data);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [token, page, retry, endSession]);

  function goTo(next: number) {
    setFailed(false);
    setData(undefined);
    setPage(next);
  }

  function signOut() {
    endSession();
    void panelRequest("/session", { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(() => {});
  }

  return (
    <main className="workspace">
      <header className="bar">
        <strong>Fonitas</strong>
        <div className="actions">{menu}<button type="button" onClick={signOut}>{t.signOut}</button></div>
      </header>
      {data && <p className="muted">{data.organization}</p>}
      <h1>{t.applications}</h1>
      {!data && !failed && <p role="status">{t.loading}</p>}
      {failed && <div role="alert">
        <p className="error">{t.unavailable}</p>
        <button type="button" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>{t.retry}</button>
      </div>}
      {data && (data.applications.length ? (
        <ul className="applications">
          {data.applications.map(app => (
            <li className="bar" key={app.public_id}>
              <div><strong>{app.name}</strong><p className="muted"><bdi>{app.slug}</bdi></p></div>
              <p className="muted"><bdi>{app.status.replaceAll("_", " ")}</bdi></p>
            </li>
          ))}
        </ul>
      ) : <p className="muted">{t.empty}</p>)}
      {data && data.last_page > 1 && (
        <nav className="actions">
          <button disabled={page <= 1} onClick={() => goTo(page - 1)}>{t.previous}</button>
          <bdi>{page} / {data.last_page}</bdi>
          <button disabled={page >= data.last_page} onClick={() => goTo(page + 1)}>{t.next}</button>
        </nav>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Panel /></StrictMode>);
