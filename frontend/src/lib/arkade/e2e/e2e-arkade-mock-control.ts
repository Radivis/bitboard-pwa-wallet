import {
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
  e2eArkadeOperatorMockState,
  resetE2eArkadeOperatorMockState,
  type E2eArkadeMockIncomingPayment,
} from '@/lib/arkade/e2e/arkade-operator-mock-state'

export type E2eArkadeMockControl = {
  setFailing: (value: boolean) => void
  setBalanceSats: (value: number) => void
  addIncomingPayment: (payment: E2eArkadeMockIncomingPayment) => void
  reset: () => void
}

export function isE2eArkadeMockEnabled(): boolean {
  return import.meta.env.VITE_E2E_ARKADE_MOCK === 'true' && import.meta.env.DEV
}

export function ensureE2eArkadeMockControl(): void {
  if (!isE2eArkadeMockEnabled() || typeof window === 'undefined') return
  if (window.__E2E_ARKADE__ != null) return

  window.__E2E_ARKADE__ = {
    setFailing: (value) => {
      e2eArkadeOperatorMockState.shouldFail = value
    },
    setBalanceSats: (value) => {
      e2eArkadeOperatorMockState.balanceSats = Math.max(0, Math.floor(value))
    },
    addIncomingPayment: (payment) => {
      e2eArkadeOperatorMockState.extraIncomingPayments = [
        payment,
        ...e2eArkadeOperatorMockState.extraIncomingPayments,
      ]
    },
    reset: () => {
      resetE2eArkadeOperatorMockState()
    },
  }
}

export function createDefaultE2eIncomingPayment(): E2eArkadeMockIncomingPayment {
  return {
    txid: E2E_ARKADE_MOCK_INCOMING_TXID,
    amountSats: E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
    timestamp: 1_700_000_000,
  }
}
