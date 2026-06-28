/**
 * Block counts aligned with repo-root `.env.regtest` (ARKD_VTXO_TREE_EXPIRY=40).
 * See frontend/tests/e2e/fixtures/arkade-regtest/README.md.
 */
export const ARKADE_REGTEST_VTXO_TREE_EXPIRY_BLOCKS = 40

/** Mine past tree expiry so the operator sweep leaves recoverable VTXOs. */
export const ARKADE_REGTEST_RECOVERABLE_MINE_BLOCKS =
  ARKADE_REGTEST_VTXO_TREE_EXPIRY_BLOCKS + 1

/** Mine close to expiry so renewal is due (renewal-soon threshold in WASM). */
export const ARKADE_REGTEST_RENEWAL_SOON_MINE_BLOCKS = 35

/** Unilateral exit delay blocks (ARKD_UNILATERAL_EXIT_DELAY=20). */
export const ARKADE_REGTEST_UNILATERAL_EXIT_DELAY_BLOCKS = 20

export { mineRegtestBlocks, fundRegtestAddress, ESPLORA_URL } from './regtest'

export async function waitForEsploraReady(): Promise<void> {
  const { checkEsploraHealthy } = await import(
    '../../../../scripts/arkade-regtest-health.mjs'
  )
  if (!(await checkEsploraHealthy())) {
    throw new Error('Esplora regtest API is not ready')
  }
}

export async function waitForArkdReady(): Promise<void> {
  const { checkArkdHealthy } = await import('../../../../scripts/arkade-regtest-health.mjs')
  if (!(await checkArkdHealthy())) {
    throw new Error('arkd regtest operator is not ready')
  }
}
