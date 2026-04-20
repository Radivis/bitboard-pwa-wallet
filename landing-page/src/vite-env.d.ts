/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Wallet PWA version from repository root `VERSION`; injected in `landing-page/vite.config.ts`. */
  readonly VITE_WALLET_APP_VERSION: string
}
