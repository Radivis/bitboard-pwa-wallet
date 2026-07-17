/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** From repository root `VERSION` at build time (`vite.config.ts`). */
  readonly VITE_APP_VERSION: string
  readonly VITE_API_BASE_URL: string
  /** Set by Vite define when CI env var is present (e.g. GitHub Actions). Used to disable dev overlays in E2E. */
  readonly CI?: boolean
  /** E2E-only switch to use in-memory Lightning NWC mock backend. */
  readonly VITE_E2E_NWC_MOCK?: string
  /** E2E-only switch to serve mocked Ark operator responses via Vite middleware. */
  readonly VITE_E2E_ARKADE_MOCK?: string
  /** E2E-only: real local arkd via arkade-regtest (no operator mock). */
  readonly VITE_E2E_ARKADE_REGTEST?: string
  /** Local arkd operator URL for regtest (dev / E2E). */
  readonly VITE_ARKADE_OPERATOR_REGTEST?: string
  /** Set to `1` or `true` to hide TanStack Router devtools in dev (e.g. for screenshots). */
  readonly VITE_HIDE_ROUTER_DEVTOOLS?: string
  /**
   * Set to `1` only in dev/CI (non-production Vite builds) to use fast Argon2id params.
   * Must not be set for `vite build` / production; see `argon2-ci-env.ts` and `vite.config.ts`.
   */
  readonly VITE_ARGON2_CI?: string
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
  /** DEV E2E: SPA navigate to lab tx viewer (avoids reload before OPFS persists mempool). */
  __e2eNavigateToLabTx?: (txid: string) => Promise<void>
  /** DEV E2E: SPA navigate to Arkade receive (avoids full reload that locks the wallet). */
  __e2eNavigateToReceiveArkade?: () => Promise<void>
  __E2E_NWC__?: {
    setFailing: (value: boolean) => void
    setBalanceSats: (value: number) => void
    addPayment: (payment: import('@/lib/lightning/lightning-backend-service').LightningPayment) => void
    reset: () => void
  }
  __E2E_ARKADE__?: import('@/lib/arkade/e2e/e2e-arkade-mock-control').E2eArkadeMockControl
  /** DEV + `VITE_E2E_ARKADE_REGTEST`: export boarded-wallet fixture for Rust regtest. */
  __e2eExportBoardedWalletSdkPersistenceJson?: () => Promise<string>
  /** DEV + `VITE_E2E_ARKADE_REGTEST`: read operator trust status from the live WASM session. */
  __e2eGetOperatorTrustStatus?: () => Promise<
    import('@/workers/arkade-api').ArkadeOperatorTrustStatus
  >
}
