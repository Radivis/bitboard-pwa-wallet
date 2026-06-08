import {
  E2E_ARKADE_MOCK_CONTROL_PATH,
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
  E2E_ARKADE_MOCK_PARTITION_HEADER,
  readE2eArkadeMockPartitionFromCookieHeader,
  type E2eArkadeMockIncomingPayment,
} from '@/lib/arkade/e2e/arkade-operator-mock-state'

export type E2eArkadeMockControl = {
  setFailing: (value: boolean) => Promise<void>
  setBalanceSats: (value: number) => Promise<void>
  addIncomingPayment: (payment: E2eArkadeMockIncomingPayment) => Promise<void>
  reset: () => Promise<void>
}

export function isE2eArkadeMockEnabled(): boolean {
  return import.meta.env.VITE_E2E_ARKADE_MOCK === 'true' && import.meta.env.DEV
}

function readBrowserE2eArkadeMockPartitionId(): string {
  if (typeof document === 'undefined') {
    return 'default'
  }
  return readE2eArkadeMockPartitionFromCookieHeader(document.cookie) ?? 'default'
}

async function postE2eArkadeMockControl(body: Record<string, unknown>): Promise<void> {
  const partitionId = readBrowserE2eArkadeMockPartitionId()
  const response = await fetch(E2E_ARKADE_MOCK_CONTROL_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      [E2E_ARKADE_MOCK_PARTITION_HEADER]: partitionId,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`E2E Arkade mock control failed (${response.status}): ${errorText}`)
  }
}

export function ensureE2eArkadeMockControl(): void {
  if (!isE2eArkadeMockEnabled() || typeof window === 'undefined') return
  if (window.__E2E_ARKADE__ != null) return

  window.__E2E_ARKADE__ = {
    setFailing: (value) => postE2eArkadeMockControl({ action: 'setFailing', value }),
    setBalanceSats: (value) => postE2eArkadeMockControl({ action: 'setBalanceSats', value }),
    addIncomingPayment: (payment) =>
      postE2eArkadeMockControl({ action: 'addIncomingPayment', payment }),
    reset: () => postE2eArkadeMockControl({ action: 'reset' }),
  }
}

export function createDefaultE2eIncomingPayment(): E2eArkadeMockIncomingPayment {
  return {
    txid: E2E_ARKADE_MOCK_INCOMING_TXID,
    amountSats: E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
    timestamp: 1_700_000_000,
  }
}
