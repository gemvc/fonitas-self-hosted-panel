import "./styles.css";

const copy = {
  en: { loading: "Loading…", unavailable: "Dashboard unavailable.", support: "Support", status: "Status", title: "Application dashboard" },
  fa: { loading: "در حال بارگیری…", unavailable: "داشبورد در دسترس نیست.", support: "پشتیبانی", status: "وضعیت", title: "داشبورد نرم‌افزار" },
  ar: { loading: "جارٍ التحميل…", unavailable: "لوحة التحكم غير متاحة.", support: "الدعم", status: "الحالة", title: "لوحة تحكم التطبيق" },
};

type Branding = { name: string; logo: string; favicon?: string; accent: string; language: keyof typeof copy; support: string };
type Application = { name: string; status: string };

async function readDashboard<T>(view: "branding" | "application"): Promise<T> {
  const response = await fetch("/index.php?view=" + view, { cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error("Dashboard unavailable");
  return response.json() as Promise<T>;
}

const dashboard = document.querySelector<HTMLElement>("#dashboard")!;
const message = document.querySelector<HTMLElement>("#message")!;
const section = document.querySelector<HTMLElement>("#application")!;
const logo = document.querySelector<HTMLImageElement>("#logo")!;
const support = document.querySelector<HTMLAnchorElement>("#support")!;

async function showDashboard() {
  let labels = copy.en;
  try {
    const branding = await readDashboard<Branding>("branding");
    labels = copy[branding.language] ?? copy.en;
    document.documentElement.lang = branding.language;
    document.documentElement.dir = branding.language === "en" ? "ltr" : "rtl";
    document.documentElement.style.setProperty("--dashboard-accent", branding.accent);
    document.title = branding.name;
    document.querySelector("#brand")!.textContent = branding.name;
    if (branding.logo) {
      logo.src = branding.logo;
      logo.hidden = false;
    }
    if (branding.favicon) {
      const icon = document.createElement("link");
      icon.rel = "icon";
      icon.href = branding.favicon;
      document.head.append(icon);
    }
    if (branding.support) {
      support.href = branding.support;
      support.textContent = labels.support;
      support.hidden = false;
    }

    message.textContent = labels.loading;
    dashboard.hidden = false;
    const application = await readDashboard<Application>("application");
    document.querySelector("#application-name")!.textContent = application.name;
    document.querySelector("#application-status")!.textContent = labels.status + " · " + application.status.replaceAll("_", " ");
    section.hidden = false;
    message.hidden = true;
  } catch {
    message.textContent = labels.unavailable;
    dashboard.hidden = false;
  }
}

void showDashboard();
