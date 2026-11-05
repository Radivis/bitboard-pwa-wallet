function viteEnv(): ImportMetaEnv | undefined {
  return import.meta.env
}

/** Local captaind. Product Signet and Mainnet URLs stay hardcoded. */
export const BARK_REGTEST_SERVER_URL =
  viteEnv()?.VITE_BARK_REGTEST_SERVER_URL ?? 'http://localhost:3535'

/** Esplora already served by the arkade-regtest gateway. */
export const BARK_REGTEST_ESPLORA_URL =
  viteEnv()?.VITE_BARK_REGTEST_ESPLORA_URL ?? 'http://localhost:7030/api'

/** Playwright sets this. Production builds leave Bark on Signet and Mainnet. */
export function isE2eBarkRegtestControlEnabled(): boolean {
  const env = viteEnv()
  if (env == null) return false
  return env.VITE_E2E_BARK_REGTEST === 'true' && Boolean(env.DEV)
}

/**
 * A Bark sync progresses live emergency exits. The refresh regtest test sets this
 * while it syncs coins that are still cancelable, so that sync can show the block
 * without broadcasting the exit.
 */
export function e2eBarkSyncSettlesExits(): boolean {
  if (!isE2eBarkRegtestControlEnabled()) return true
  if (typeof window === 'undefined') return true
  return window.__bitboardE2eSkipBarkExitSettle !== true
}
