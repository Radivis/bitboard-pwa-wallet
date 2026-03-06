/**
 * Helpers for E2E tests that use the regtest environment (bitcoinerlab/tester).
 * Requires the regtest container to be running: npm run test:regtest:start
 *
 * The server on port 8080 follows the bitcoinjs regtest-server API:
 * - POST /1/r/faucet?key=<key>&address=<addr>&value=<sats>
 * - POST /1/r/generate?key=<key>&count=<n>
 *
 * The bitcoinerlab/tester image uses regtest-server, which requires the key param.
 * Default key is "satoshi" (regtest-client default). Override with REGTEST_FAUCET_KEY.
 */
const REGTEST_SERVER_URL = 'http://localhost:8080/1'
const DEFAULT_FAUCET_SATS = 100_000
const DEFAULT_FAUCET_KEY = 'satoshi'

function getAuthQuery(): string {
  const key = process.env.REGTEST_FAUCET_KEY ?? DEFAULT_FAUCET_KEY
  return `key=${encodeURIComponent(key)}&`
}

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

/**
 * Mine one or more blocks so pending txs are confirmed.
 */
export async function mineRegtestBlocks(count: number = 1): Promise<void> {
  const url = `${REGTEST_SERVER_URL}/r/generate?${getAuthQuery()}count=${count}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Regtest generate failed (${res.status}): ${text}`)
  }
}
