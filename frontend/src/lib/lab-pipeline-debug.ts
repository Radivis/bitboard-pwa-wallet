/**
 * Systematic lab debugging (no guessing).
 *
 * Enable ONE of:
 *   - URL: append ?labDebug=1 (first navigation)
 *   - Console: localStorage.setItem('bitboard_lab_debug', '1'); location.reload()
 *
 * Then reproduce (mine in lab). In DevTools Console, filter by `[lab-pipeline]`.
 * You should see strict ordering: hydrate/mine/reset never overlapping wrongly, and
 * utxoCount / totalSatsAfter after each step.
 *
 * Playwright (see tests/e2e/helpers/lab-debug.ts):
 *   await enableLabPipelineDebug(page)
 *
 * Interpretation (read logs in time order):
 *   - mineBlocks:workerReturned totalSats ≈ 5_000_000_000 × blocks mined → WASM + worker OK.
 *   - workerReturned good but mineBlocks:afterApply totalSats 0 → apply/Zustand bug.
 *   - workerReturned totalSats 0 → WASM/coinbase path; run WASM check below in DevTools.
 *   - hydrate:end after mineBlocks:afterApply with empty utxos → something called hydrate with stale DB
 *     or overwrote store after mine (grep for other set() on lab store).
 *
 * Manual WASM check (DevTools, app on any page after wasm loaded):
 *   const M = await import('@/wasm-pkg/bitboard_crypto.js'); await M.default?.();
 *   const a = M.lab_generate_keypair(); const addr = a.address;
 *   const spk = M.lab_address_to_script_pubkey_hex(addr);
 *   const hex = M.lab_mine_block('', 0, spk, [], 0n);
 *   const fx = M.lab_block_effects(hex);
 *   console.log(fx.new_utxos?.[0]?.amount_sats);  // expect 5000000000
 */

const STORAGE_KEY = 'bitboard_lab_debug'
const URL_PARAM = 'labDebug'

export function isLabPipelineDebugEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage?.getItem(STORAGE_KEY) === '1') return true
    return new URLSearchParams(window.location.search).get(URL_PARAM) === '1'
  } catch {
    return false
  }
}

function totalSats(utxos: { amountSats: number }[]): number {
  return utxos.reduce((s, u) => s + (Number(u.amountSats) || 0), 0)
}

export function labPipelineDebugLog(
  phase: string,
  detail: Record<string, unknown> = {},
): void {
  if (!isLabPipelineDebugEnabled()) return
  const line = `[lab-pipeline] ${phase}`
  console.info(line, { ms: Math.round(performance.now()), ...detail })
}

/** Call from labStore after reading state (getState()). */
export function labPipelineSnapshot(
  label: string,
  state: {
    blocks: unknown[]
    utxos: { amountSats: number }[]
    isHydrated: boolean
  },
): void {
  if (!isLabPipelineDebugEnabled()) return
  labPipelineDebugLog(label, {
    blockCount: state.blocks.length,
    utxoCount: state.utxos.length,
    totalSats: totalSats(state.utxos),
    isHydrated: state.isHydrated,
  })
}
