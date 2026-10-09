import { getDatabase } from '@/db'
import { loadWalletSecrets } from '@/db/wallet-persistence'
import {
  BARK_REGTEST_ESPLORA_URL,
  BARK_REGTEST_SERVER_URL,
  isE2eBarkRegtestControlEnabled,
} from '@/lib/bark/e2e/bark-regtest-env'
import { useWalletStore } from '@/stores/walletStore'

export { BARK_REGTEST_ESPLORA_URL, BARK_REGTEST_SERVER_URL, isE2eBarkRegtestControlEnabled }

export type BarkBoardedFixture = {
  mnemonic: string
  recordDump: string
}

/**
 * Mnemonic and Bark record dump after a board flush.
 * Rust phase 1 does not load this file; the export proves the dump round-trip.
 */
export async function exportBoardedBarkFixtureForE2e(): Promise<BarkBoardedFixture> {
  const walletId = useWalletStore.getState().activeWalletId
  const networkMode = useWalletStore.getState().networkMode
  if (walletId == null || networkMode !== 'regtest') {
    throw new Error('Wallet must be unlocked on regtest to export a Bark fixture')
  }

  const secrets = await loadWalletSecrets(getDatabase(), walletId)
  const recordDump = secrets.barkAccounts?.find((a) => a.networkMode === 'regtest')?.recordDump
  if (recordDump == null || recordDump.trim() === '') {
    throw new Error('Bark regtest record dump is missing after boarding')
  }
  return { mnemonic: secrets.mnemonic, recordDump }
}

export function ensureE2eBarkRegtestControl(): void {
  if (!isE2eBarkRegtestControlEnabled() || typeof window === 'undefined') {
    return
  }
  if (window.__e2eExportBoardedBarkFixture != null) {
    return
  }
  window.__e2eExportBoardedBarkFixture = exportBoardedBarkFixtureForE2e
}
