/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /** Set by Vite define when CI env var is present (e.g. GitHub Actions). Used to disable dev overlays in E2E. */
  readonly CI?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Test hook for E2E: returns lab state. Only set when import.meta.env.DEV. */
interface Window {
  __labGetState?: () => Promise<import('@/workers/lab-api').LabState>
}
