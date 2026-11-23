/**
 * Development-phase origin policy.
 * Allow http://localhost (and loopback) alongside https:// domain URLs.
 * Set to false before production lock-down so localhost is rejected.
 */
export const ALLOW_LOCALHOST_ORIGINS = true;

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
