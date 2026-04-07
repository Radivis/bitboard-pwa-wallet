/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /** Set by Vite define when CI env var is present (e.g. GitHub Actions). Used to disable dev overlays in E2E. */
  readonly CI?: boolean
  /** E2E-only switch to use in-memory Lightning NWC mock backend. */
  readonly VITE_E2E_NWC_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Test hook for E2E: returns lab state. Only set when import.meta.env.DEV. */
interface Window {
  __labGetState?: () => Promise<import('@/workers/lab-api').LabState>
  __E2E_NWC__?: {
    setFailing: (value: boolean) => void
    setBalanceSats: (value: number) => void
    addPayment: (payment: import('@/lib/lightning-backend-service').LightningPayment) => void
    reset: () => void
  }
}
