/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_LOCALHOST_ORIGINS?: string;
  readonly VITE_IDENTITY_TENANT_SLUG?: string;
  /** Override Identity API base, e.g. `/fonitas-api/api/v1` or `https://api.fonitas.com/api/v1`. */
  readonly VITE_IDENTITY_API?: string;
  /** Override customer session API base (License / Payment / Support). */
  readonly VITE_CUSTOMER_API?: string;
  /** Installation-bound application UUID (local override for OEM filtering). */
  readonly VITE_APPLICATION_ID?: string;
  /** When "true", use same-origin `/api/v1` (OEM production + customer PHP bridge). */
  readonly VITE_OEM_SAME_ORIGIN_API?: string;
  /** Optional Help space slug for public article deep links. */
  readonly VITE_HELP_SPACE_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
