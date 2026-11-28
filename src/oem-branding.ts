export type OemBranding = {
  name: string
  logo: string
  favicon: string
  accent: string
  language: string
  support: string
};

const fallback: OemBranding = {
  name: "Fonitas",
  logo: "",
  favicon: "",
  accent: "#0f766e",
  language: "en",
  support: "",
};

function applyDocumentBranding(branding: OemBranding): void {
  document.title = branding.name || "Fonitas";
  if (/^#[0-9a-fA-F]{6}$/.test(branding.accent)) {
    document.documentElement.style.setProperty("--dashboard-accent", branding.accent);
  }
  if (branding.favicon) {
    let icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = branding.favicon;
  }
}

/** Public OEM branding from installer state (`GET /index.php?view=branding`). */
export async function loadOemBranding(): Promise<OemBranding> {
  try {
    const response = await fetch("/index.php?view=branding", {
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      applyDocumentBranding(fallback);
      return fallback;
    }
    const body = await response.json() as Partial<OemBranding>;
    const branding: OemBranding = {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : fallback.name,
      logo: typeof body.logo === "string" ? body.logo : "",
      favicon: typeof body.favicon === "string" ? body.favicon : "",
      accent: typeof body.accent === "string" ? body.accent : fallback.accent,
      language: typeof body.language === "string" ? body.language : fallback.language,
      support: typeof body.support === "string" ? body.support : "",
    };
    applyDocumentBranding(branding);
    return branding;
  } catch {
    applyDocumentBranding(fallback);
    return fallback;
  }
}
