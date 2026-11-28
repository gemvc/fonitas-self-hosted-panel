import { StrictMode, useCallback, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { BrandMark } from "./brand-mark";
import { createLocalCustomerSession, isLocalCustomerToken } from "./customer-session";
import { GuestBuy } from "./guest-buy";
import {
  forgotPassword,
  IdentityApiError,
  loginIdentityUser,
  registerIdentityUser,
  resetPassword,
  verifyMfaChallenge,
} from "./identity-api";
import { messages, type Language } from "./locale";
import { loadOemBranding, type OemBranding } from "./oem-branding";
import {
  clearLocalMe,
  clearVerificationEmailPending,
  markVerificationEmailPending,
  rememberLocalMe,
} from "./panel-me";
import { panelRequest, type PanelSession } from "./panel-login";
import {
  capturePostAuthIntent,
  shouldOpenGuestShop,
  stashPostAuthSection,
  takePostAuthSection,
} from "./panel-return";
import { isAllowedPanelOrigin } from "./origin";
import { Workspace } from "./workspace";
import "./styles.css";

const hostedSettings = "https://developerpannel.fonitas.com/settings/custom-domains";
const allowedOrigin = isAllowedPanelOrigin();
const setupPairing = new URLSearchParams(window.location.search).get("setup") === "1";
const resetTokenFromUrl = (() => {
  const token = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
  return token.length === 64 ? token : "";
})();

type Text = typeof messages.en;
type AuthMode = "sign-in" | "register" | "forgot" | "reset" | "mfa";
type PairingError = "invalidKey" | "rejectedKey" | "unavailable";
type AuthError =
  | "authFailed"
  | "passwordMismatch"
  | "unavailable"
  | "emailTaken"
  | "registerFailed"
  | "registerInvalid"
  | "tenantUnavailable"
  | "resetPasswordFailed"
  | "validation";

function defaultLanguage(): Language {
  const preferred = localStorage.getItem("fonitas-panel-language") ?? navigator.language.split("-")[0];
  return preferred === "fa" || preferred === "ar" ? preferred : "en";
}

function Panel() {
  const [language, setLanguage] = useState(defaultLanguage);
  const [branding, setBranding] = useState<OemBranding>({ name: "Fonitas", logo: "", favicon: "", accent: "#0f766e", language: "en", support: "" });
  const [session, setSession] = useState<PanelSession | null>(null);
  const [guestBrowse, setGuestBrowse] = useState(() => !setupPairing && shouldOpenGuestShop());
  const [authMode, setAuthMode] = useState<AuthMode>(resetTokenFromUrl ? "reset" : "sign-in");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaEmail, setMfaEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [attachHint, setAttachHint] = useState(false);
  const [postAuthSection, setPostAuthSection] = useState(() => takePostAuthSection());
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
    void loadOemBranding().then(setBranding);
  }, []);

  useEffect(() => {
    if (session || setupPairing) return;
    capturePostAuthIntent();
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") === "licenses" || window.location.hash.includes("recovery=")) {
      setAttachHint(true);
      stashPostAuthSection("licenses");
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const timeout = window.setTimeout(endSession, session.expires_in * 1000);
    return () => window.clearTimeout(timeout);
  }, [session, endSession]);

  function openSession(displayName: string, email: string, verified: boolean) {
    const next = createLocalCustomerSession(displayName, email);
    if (verified) next.me.email_verified = true;
    rememberLocalMe(next.me);
    setGuestBrowse(false);
    setMfaToken("");
    setAuthMode("sign-in");
    setSession({ access_token: next.access_token, expires_in: next.expires_in });
    const pending = takePostAuthSection() ?? postAuthSection;
    if (pending) setPostAuthSection(pending);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const confirm = String(form.get("confirm") ?? "");
    const code = String(form.get("code") ?? "").trim();

    setAuthError(null);
    setBusy(true);
    setSignedOut(false);
    try {
      if (authMode === "forgot") {
        if (!email) { setAuthError("authFailed"); return; }
        await forgotPassword(email);
        setForgotSent(true);
        return;
      }
      if (authMode === "reset") {
        if (!resetTokenFromUrl || password.length < 8) { setAuthError("validation"); return; }
        if (password !== confirm) { setAuthError("passwordMismatch"); return; }
        await resetPassword(resetTokenFromUrl, password);
        setResetDone(true);
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        setAuthMode("sign-in");
        return;
      }
      if (authMode === "mfa") {
        if (!mfaToken || !/^\d{6}$/.test(code)) { setAuthError("validation"); return; }
        const verified = await verifyMfaChallenge({ token: mfaToken, code });
        if (!verified.email_verified) markVerificationEmailPending();
        else clearVerificationEmailPending();
        openSession(verified.display_name || mfaEmail.split("@")[0] || mfaEmail, verified.email || mfaEmail, verified.email_verified);
        event.currentTarget.reset();
        return;
      }

      if (!email || !password) {
        setAuthError("authFailed");
        return;
      }
      if (authMode === "register" && password !== confirm) {
        setAuthError("passwordMismatch");
        return;
      }

      let displayName = authMode === "register" && name ? name : email.split("@")[0] || email;
      let verified = false;
      if (authMode === "register") {
        const registered = await registerIdentityUser({ displayName, email, password });
        displayName = registered.display_name || displayName;
        verified = registered.email_verified;
        if (!verified) markVerificationEmailPending();
        else clearVerificationEmailPending();
      } else {
        const loggedIn = await loginIdentityUser({ email, password });
        if (loggedIn.mfa_required && loggedIn.challenge_token) {
          setMfaToken(loggedIn.challenge_token);
          setMfaEmail(email);
          setAuthMode("mfa");
          return;
        }
        displayName = loggedIn.display_name || displayName;
        verified = loggedIn.email_verified;
        if (!verified) markVerificationEmailPending();
        else clearVerificationEmailPending();
      }
      openSession(displayName, email, verified);
      event.currentTarget.reset();
    } catch (cause) {
      if (cause instanceof IdentityApiError) {
        if (cause.message === "auth_failed") setAuthError(authMode === "reset" ? "resetPasswordFailed" : "authFailed");
        else if (cause.message === "email_taken") setAuthError("emailTaken");
        else if (cause.message === "validation") {
          setAuthError(authMode === "register" ? "registerInvalid" : "validation");
        } else if (cause.message === "register_failed") setAuthError("registerFailed");
        else if (cause.message === "tenant_unavailable") setAuthError("tenantUnavailable");
        else if (cause.message === "rate_limited") setAuthError("unavailable");
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
    setPostAuthSection(null);
    if (isLocalCustomerToken(token)) return;
    void panelRequest("/session", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      keepalive: true,
    }).catch(() => {});
  }

  function browseAsGuest() {
    endSession();
    setGuestBrowse(true);
    setSignedOut(false);
    const url = new URL(window.location.href);
    if (!url.searchParams.get("section") && !url.searchParams.get("checkout")) {
      url.searchParams.set("section", "buy");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
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
        branding={branding}
        initialSection={postAuthSection ?? undefined}
        onBrowseAsGuest={browseAsGuest}
        onSignOut={() => signOut(session.access_token)}
      />
    );
  }

  if (guestBrowse && !setupPairing) {
    return (
      <GuestBuy
        t={t}
        menu={languageMenu}
        branding={branding}
        onBackToAuth={() => setGuestBrowse(false)}
      />
    );
  }

  return (
    <main className="setup">
      <section className="card">
        <header className="bar"><BrandMark branding={branding} />{languageMenu}</header>
        {signedOut && <p role="status">{t.signedOut}</p>}
        {attachHint && !setupPairing && <p role="status">{t.signInToAttachHint}</p>}
        {resetDone && <p role="status">{t.resetPasswordSuccess}</p>}

        {setupPairing ? (
          <Pairing t={t} />
        ) : (
          <section className="auth">
            <h1>
              {authMode === "mfa" ? t.mfaHeading
                : authMode === "forgot" ? t.forgotPasswordHeading
                  : authMode === "reset" ? t.resetPasswordHeading
                    : t.welcomeTitle}
            </h1>
            <p className="muted">
              {authMode === "mfa" ? t.mfaIntro
                : authMode === "forgot" ? t.forgotPasswordIntro
                  : authMode === "reset" ? t.resetPasswordIntro
                    : t.welcomeIntro}
            </p>
            {(authMode === "sign-in" || authMode === "register") && (
              <div className="auth-tabs" role="tablist" aria-label={t.welcomeTitle}>
                <button type="button" role="tab" aria-selected={authMode === "sign-in"}
                  className={authMode === "sign-in" ? "primary" : undefined}
                  onClick={() => { setAuthMode("sign-in"); setAuthError(null); }}>{t.signIn}</button>
                <button type="button" role="tab" aria-selected={authMode === "register"}
                  className={authMode === "register" ? "primary" : undefined}
                  onClick={() => { setAuthMode("register"); setAuthError(null); }}>{t.register}</button>
              </div>
            )}
            <form onSubmit={event => void submitAuth(event)}>
              {authMode === "register" && (
                <label>{t.name}
                  <input name="name" type="text" autoComplete="name" required disabled={busy} />
                </label>
              )}
              {(authMode === "sign-in" || authMode === "register" || authMode === "forgot") && (
                <label>{t.email}
                  <input name="email" type="email" dir="ltr" autoComplete="email" required disabled={busy} />
                </label>
              )}
              {(authMode === "sign-in" || authMode === "register" || authMode === "reset") && (
                <label>{authMode === "reset" ? t.newPassword : t.password}
                  <input name="password" type="password"
                    autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
                    required minLength={8} disabled={busy} />
                </label>
              )}
              {(authMode === "register" || authMode === "reset") && (
                <label>{t.confirmPassword}
                  <input name="confirm" type="password" autoComplete="new-password" required minLength={8} disabled={busy} />
                </label>
              )}
              {authMode === "mfa" && (
                <label>{t.mfaCode}
                  <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code"
                    required pattern="[0-9]{6}" maxLength={6} dir="ltr" disabled={busy} autoFocus />
                </label>
              )}
              {forgotSent && authMode === "forgot" && <p role="status">{t.forgotPasswordSent}</p>}
              {authError && <p role="alert" className="error">{t[authError]}</p>}
              <button className="primary full" disabled={busy}>
                {busy ? t.loading
                  : authMode === "register" ? t.register
                    : authMode === "forgot" ? t.forgotPasswordSubmit
                      : authMode === "reset" ? t.resetPasswordSubmit
                        : authMode === "mfa" ? t.mfaSubmit
                          : t.signIn}
              </button>
            </form>
            {authMode === "sign-in" && (
              <button type="button" className="full" disabled={busy} onClick={() => { setAuthMode("forgot"); setAuthError(null); setForgotSent(false); }}>
                {t.forgotPassword}
              </button>
            )}
            {(authMode === "forgot" || authMode === "mfa" || authMode === "reset") && (
              <button type="button" className="full" disabled={busy} onClick={() => { setAuthMode("sign-in"); setAuthError(null); setMfaToken(""); }}>
                {authMode === "mfa" ? t.mfaBack : t.backToSignInFromReset}
              </button>
            )}
            {(authMode === "sign-in" || authMode === "register") && (
              <button type="button" className="full" disabled={busy} onClick={() => { setAuthError(null); setGuestBrowse(true); }}>
                {t.continueWithoutAccount}
              </button>
            )}
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
