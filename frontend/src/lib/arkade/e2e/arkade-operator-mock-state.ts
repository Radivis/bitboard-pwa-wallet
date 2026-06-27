/** Valid 64-char hex txid for ark-rest / WASM parsing; used in activity feed testid. */
export const E2E_ARKADE_MOCK_INCOMING_TXID =
  'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe'

/** Batch commitment txid paired with the fixture VTXO (ark-core history requires commitment_txids[0]). */
export const E2E_ARKADE_MOCK_COMMITMENT_TXID =
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

export const E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS = 42_000

/** Second incoming payment injected after Receive (E2E-ARK-MOCK-04). */
export const E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID =
  'feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface'
export const E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS = 5_000

/**
 * Per-test mock partition id — sent as a request header (main thread) and cookie (worker fetch).
 * Worker operator calls bypass Playwright `page.route`; same-origin cookies reach Vite middleware.
 */
export const E2E_ARKADE_MOCK_PARTITION_HEADER = 'x-e2e-arkade-mock-partition'
export const E2E_ARKADE_MOCK_PARTITION_COOKIE = E2E_ARKADE_MOCK_PARTITION_HEADER

/** Dev-only POST endpoint (Vite middleware) for `window.__E2E_ARKADE__` control calls. */
export const E2E_ARKADE_MOCK_CONTROL_PATH = '/__e2e/arkade-mock/control'

export type E2eArkadeMockIncomingPayment = {
  txid: string
  amountSats: number
  timestamp: number
}

export type E2eArkadeOperatorMockState = {
  shouldFail: boolean
  balanceSats: number
  /** Script hex → indexer VTXO payment (supports multiple receive addresses per partition). */
  paymentsByScript: Map<string, E2eArkadeMockIncomingPayment>
  /** Queued by `addIncomingPayment` control action; applied on next unfunded script in a vtxos query. */
  pendingIncomingPayment: E2eArkadeMockIncomingPayment | null
  /** When set, returned from `/v1/info` instead of the static fixture (E2E signer rotation). */
  serverInfoJson: string | null
}

function createDefaultMockState(): E2eArkadeOperatorMockState {
  return {
    shouldFail: false,
    balanceSats: E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
    paymentsByScript: new Map(),
    pendingIncomingPayment: null,
    serverInfoJson: null,
  }
}

export function clearE2eArkadeOperatorMockDiscoveryState(
  mockState: E2eArkadeOperatorMockState,
): void {
  mockState.paymentsByScript.clear()
  mockState.pendingIncomingPayment = null
}

const mockStateByPartition = new Map<string, E2eArkadeOperatorMockState>()

export function readE2eArkadeMockPartitionFromCookieHeader(cookieHeader: string): string | null {
  const prefix = `${E2E_ARKADE_MOCK_PARTITION_COOKIE}=`
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      const value = decodeURIComponent(trimmed.slice(prefix.length)).trim()
      if (value !== '') {
        return value
      }
    }
  }
  return null
}

export function resolveE2eArkadeMockPartitionId(partitionId: string | null | undefined): string {
  if (partitionId != null) {
    const trimmed = partitionId.trim()
    if (trimmed !== '') {
      return trimmed
    }
  }
  return 'default'
}

export function readE2eArkadeMockPartitionIdFromRequestHeaders(headers: {
  cookie?: string | string[]
  [headerName: string]: string | string[] | undefined
}): string {
  const rawHeader = headers[E2E_ARKADE_MOCK_PARTITION_HEADER]
  if (typeof rawHeader === 'string' && rawHeader.trim() !== '') {
    return rawHeader.trim()
  }

  const cookieHeader = headers.cookie
  if (typeof cookieHeader === 'string') {
    const fromCookie = readE2eArkadeMockPartitionFromCookieHeader(cookieHeader)
    if (fromCookie != null) {
      return fromCookie
    }
  }

  return 'default'
}

export function getE2eArkadeOperatorMockState(partitionId: string): E2eArkadeOperatorMockState {
  const key = resolveE2eArkadeMockPartitionId(partitionId)
  let state = mockStateByPartition.get(key)
  if (state == null) {
    state = createDefaultMockState()
    mockStateByPartition.set(key, state)
  }
  return state
}

export function resetE2eArkadeOperatorMockState(partitionId = 'default'): void {
  const key = resolveE2eArkadeMockPartitionId(partitionId)
  mockStateByPartition.set(key, createDefaultMockState())
}
