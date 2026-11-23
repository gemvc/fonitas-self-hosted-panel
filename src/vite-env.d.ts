/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_LOCALHOST_ORIGINS?: string;
  readonly VITE_IDENTITY_TENANT_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
