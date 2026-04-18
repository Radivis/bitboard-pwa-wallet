/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Legal imprint (Impressum); injected at build time from repo-root `.env.imprint`. */
  readonly VITE_IMPRINT?: string
  /** Wallet PWA version from `frontend/package.json`; injected in `landing-page/vite.config.ts`. */
  readonly VITE_WALLET_APP_VERSION: string
}
