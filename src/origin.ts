/**
 * Fail-closed loopback policy for the static panel.
 * Loopback HTTP is allowed only in Vite development (`import.meta.env.DEV`)
 * when `VITE_ALLOW_LOCALHOST_ORIGINS=true`. Production builds never allow it.
 */
export const ALLOW_LOCALHOST_ORIGINS =
  import.meta.env.DEV && import.meta.env.VITE_ALLOW_LOCALHOST_ORIGINS === "true";

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** True when this page may pair or sign in as a panel installation origin. */
export function isAllowedPanelOrigin(
  location: Pick<Location, "protocol" | "hostname"> = window.location,
): boolean {
  if (location.protocol === "https:") return true;
  return ALLOW_LOCALHOST_ORIGINS
    && location.protocol === "http:"
    && isLoopbackHost(location.hostname);
}
