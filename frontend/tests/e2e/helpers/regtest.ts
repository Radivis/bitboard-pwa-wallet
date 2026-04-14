/**
 * Helpers for E2E tests that use the regtest environment (bitcoinerlab/tester).
 * Requires the regtest container to be running: npm run test:regtest:start
 *
 * The server on port 8880 (!= 8080) follows the bitcoinjs regtest-server API:
 * - POST /1/r/faucet?key=<key>&address=<addr>&value=<sats>
 * - POST /1/r/generate?key=<key>&count=<n>
 *
 * The bitcoinerlab/tester image uses regtest-server, which requires the key param.
 * Default key is "satoshi" (regtest-client default). Override with REGTEST_FAUCET_KEY.
 */
const REGTEST_SERVER_URL = 'http://localhost:8880/1'
const ESPLORA_URL = 'http://localhost:3002'
const DEFAULT_FAUCET_SATS = 100_000
const DEFAULT_FAUCET_KEY = 'satoshi'

function getAuthQuery(): string {
  const key = process.env.REGTEST_FAUCET_KEY ?? DEFAULT_FAUCET_KEY
  return `key=${encodeURIComponent(key)}&`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const isCi = !!process.env.CI

/** Esplora/electrs can lag more on GitHub Actions than on a warm local Docker setup. */
const ESPLORA_INDEX_WAIT_MS = isCi ? 45_000 : 15_000

const CONFIRMED_UTXO_WAIT_MS = isCi ? 45_000 : 15_000

/** Same window as Esplora UTXO polling — use when UI must reflect post-sync wallet state. */
export const E2E_CI_AWARE_LONG_WAIT_MS = CONFIRMED_UTXO_WAIT_MS

/**
 * Send sats from the regtest miner to the given address.
 * Then you typically need to mine a block so the tx confirms.
 */
export async function fundRegtestAddress(
  address: string,
  sats: number = DEFAULT_FAUCET_SATS,
): Promise<void> {
  const url = `${REGTEST_SERVER_URL}/r/faucet?${getAuthQuery()}address=${encodeURIComponent(address)}&value=${sats}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Regtest faucet failed (${res.status}): ${text}`)
  }
}

/** Get the current block height as seen by the Esplora indexer. */
async function getEsploraBlockHeight(): Promise<number> {
  const res = await fetch(`${ESPLORA_URL}/blocks/tip/height`)
  if (!res.ok) {
    throw new Error(`Esplora tip/height failed (${res.status})`)
  }
  return parseInt(await res.text(), 10)
}

/**
 * Mine one or more blocks, then wait until the Esplora indexer (electrs) has
 * caught up. This eliminates the race where BDK syncs before electrs has
 * indexed the new block, causing funds to appear as pending instead of
 * confirmed.
 */
export async function mineRegtestBlocks(count: number = 1): Promise<void> {
  const heightBefore = await getEsploraBlockHeight()

  const url = `${REGTEST_SERVER_URL}/r/generate?${getAuthQuery()}count=${count}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Regtest generate failed (${res.status}): ${text}`)
  }

  const expectedHeight = heightBefore + count
  const deadline = Date.now() + ESPLORA_INDEX_WAIT_MS
  while (Date.now() < deadline) {
    const currentHeight = await getEsploraBlockHeight()
    if (currentHeight >= expectedHeight) return
    await sleep(200)
  }

  throw new Error(
    `Esplora did not index to height ${expectedHeight} within ${ESPLORA_INDEX_WAIT_MS / 1000}s (stuck at ${await getEsploraBlockHeight()})`,
  )
}

interface EsploraUtxo {
  txid: string
  vout: number
  value: number
  status: { confirmed: boolean; block_height?: number }
}

/**
 * Poll the Esplora API until the given address has at least `minConfirmedSats`
 * in confirmed UTXOs. This ensures electrs has fully indexed the transactions
 * within the mined block — not just the block header.
 */
export async function waitForConfirmedBalance(
  address: string,
  minConfirmedSats: number,
  timeoutMs: number = CONFIRMED_UTXO_WAIT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${ESPLORA_URL}/address/${address}/utxo`)
    if (res.ok) {
      const utxos: EsploraUtxo[] = await res.json()
      const confirmedTotal = utxos
        .filter((u) => u.status.confirmed)
        .reduce((sum, u) => sum + u.value, 0)
      if (confirmedTotal >= minConfirmedSats) return
    }
    await sleep(250)
  }

  throw new Error(
    `Esplora did not show ≥${minConfirmedSats} confirmed sats for ${address} within ${timeoutMs}ms`,
  )
}
