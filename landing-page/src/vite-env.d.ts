/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** German legal notice text; injected from repo-root `.env.legal-notice.de`. */
  readonly VITE_LEGAL_NOTICE_DE?: string
  /** English legal notice text; injected from repo-root `.env.legal-notice.en`. */
  readonly VITE_LEGAL_NOTICE_EN?: string
  /** Wallet PWA version from `frontend/package.json`; injected in `landing-page/vite.config.ts`. */
  readonly VITE_WALLET_APP_VERSION: string
}
