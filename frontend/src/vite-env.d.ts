/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** From `frontend/package.json` at build time (`vite.config.ts`). */
  readonly VITE_APP_VERSION: string
  readonly VITE_API_BASE_URL: string
  /** Set by Vite define when CI env var is present (e.g. GitHub Actions). Used to disable dev overlays in E2E. */
  readonly CI?: boolean
  /** E2E-only switch to use in-memory Lightning NWC mock backend. */
  readonly VITE_E2E_NWC_MOCK?: string
  /** Set to `1` or `true` to hide TanStack Router devtools in dev (e.g. for screenshots). */
  readonly VITE_HIDE_ROUTER_DEVTOOLS?: string
  /** Legal imprint (Impressum); injected at build time from repo-root `.env.imprint`. */
  readonly VITE_IMPRINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Test hook for E2E: returns lab state. Only set when import.meta.env.DEV. */
interface Window {
  __labGetState?: () => Promise<import('@/workers/lab-api').LabState>
  /** E2E: full tx details (incl. mempool) from lab worker. Only set when import.meta.env.DEV. */
  __labGetTransaction?: (
    txid: string,
  ) => Promise<import('@/workers/lab-api').LabTxDetails | null>
  __E2E_NWC__?: {
    setFailing: (value: boolean) => void
    setBalanceSats: (value: number) => void
    addPayment: (payment: import('@/lib/lightning-backend-service').LightningPayment) => void
    reset: () => void
  }
}
