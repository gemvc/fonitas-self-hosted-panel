/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_LOCALHOST_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
