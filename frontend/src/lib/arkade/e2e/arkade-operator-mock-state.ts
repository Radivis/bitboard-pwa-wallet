/** Valid 64-char hex txid for ark-rest / WASM parsing; used in activity feed testid. */
export const E2E_ARKADE_MOCK_INCOMING_TXID =
  'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe'

export const E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS = 42_000

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

export const e2eArkadeOperatorMockState: E2eArkadeOperatorMockState = {
  shouldFail: false,
  balanceSats: E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  extraIncomingPayments: [],
  fundedScript: null,
}

export function resetE2eArkadeOperatorMockState(): void {
  e2eArkadeOperatorMockState.shouldFail = false
  e2eArkadeOperatorMockState.balanceSats = E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS
  e2eArkadeOperatorMockState.extraIncomingPayments = []
  e2eArkadeOperatorMockState.fundedScript = null
}
