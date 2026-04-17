/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Legal imprint (Impressum); injected at build time from repo-root `.env.imprint`. */
  readonly VITE_IMPRINT?: string
}
