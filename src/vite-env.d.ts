/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_LOCALHOST_ORIGINS?: string;
  readonly VITE_IDENTITY_TENANT_SLUG?: string;
  /** Override Identity API base, e.g. `/fonitas-api/api/v1` or `https://api.fonitas.com/api/v1`. */
  readonly VITE_IDENTITY_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
