/** Valid 64-char hex txid for ark-rest / WASM parsing; used in activity feed testid. */
export const E2E_ARKADE_MOCK_INCOMING_TXID =
  'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe'

/** Batch commitment txid paired with the fixture VTXO (ark-core history requires commitment_txids[0]). */
export const E2E_ARKADE_MOCK_COMMITMENT_TXID =
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

export const E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS = 42_000

/**
 * Per-test mock partition id — sent as a request header (main thread) and cookie (worker fetch).
 * Worker operator calls bypass Playwright `page.route`; same-origin cookies reach Vite middleware.
 */
export const E2E_ARKADE_MOCK_PARTITION_HEADER = 'x-e2e-arkade-mock-partition'
export const E2E_ARKADE_MOCK_PARTITION_COOKIE = E2E_ARKADE_MOCK_PARTITION_HEADER

export type E2eArkadeMockIncomingPayment = {
  txid: string
  amountSats: number
  timestamp: number
}

export type E2eArkadeOperatorMockState = {
  shouldFail: boolean
  balanceSats: number
  extraIncomingPayments: E2eArkadeMockIncomingPayment[]
  /** First Ark script that received the fixture VTXO (key discovery terminates after one hit). */
  fundedScript: string | null
}

function createDefaultMockState(): E2eArkadeOperatorMockState {
  return {
    shouldFail: false,
    balanceSats: E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
    extraIncomingPayments: [],
    fundedScript: null,
  }
}

/** @deprecated Use {@link getE2eArkadeOperatorMockState} — kept for browser-side control stubs. */
export const e2eArkadeOperatorMockState: E2eArkadeOperatorMockState = createDefaultMockState()

const mockStateByPartition = new Map<string, E2eArkadeOperatorMockState>()

export function getE2eArkadeOperatorMockState(partitionId: string): E2eArkadeOperatorMockState {
  const key = partitionId.trim() !== '' ? partitionId.trim() : 'default'
  let state = mockStateByPartition.get(key)
  if (state == null) {
    state = createDefaultMockState()
    mockStateByPartition.set(key, state)
  }
  return state
}

export function resetE2eArkadeOperatorMockState(partitionId = 'default'): void {
  mockStateByPartition.set(partitionId, createDefaultMockState())
}
