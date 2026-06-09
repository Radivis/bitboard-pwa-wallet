import {
  E2E_ARKADE_MOCK_CONTROL_PATH,
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
  E2E_ARKADE_MOCK_PARTITION_HEADER,
  readE2eArkadeMockPartitionFromCookieHeader,
  type E2eArkadeMockIncomingPayment,
} from '@/lib/arkade/e2e/arkade-operator-mock-state'

/**
 * Manual DevTools introspection only — not used by Playwright specs.
 *
 * When receive-address bugs look like "UI shows the wrong address", run in the
 * browser console (E2E mock dev build):
 *
 *   await window.__E2E_ARKADE__.readReceiveDebugSnapshot()
 *
 * Compare `offchainNextDerivationIndex` + `peekAddress` (live WASM) against the
 * address on screen and against the connection row in wallet secrets. That
 * separates WASM/persistence problems from React store / query hydration races.
 */
export type E2eArkadeReceiveDebugSnapshot = {
  offchainNextDerivationIndex: number
  peekAddress: string
}

export type E2eArkadePersistedReceiveDebugSnapshot = {
  connectionId: string
  offchainNextDerivationIndex: number
}

export type E2eArkadeMockControl = {
  setFailing: (value: boolean) => Promise<void>
  setBalanceSats: (value: number) => Promise<void>
  addIncomingPayment: (payment: E2eArkadeMockIncomingPayment) => Promise<void>
  reset: () => Promise<void>
  /** @see E2eArkadeReceiveDebugSnapshot — manual DevTools only, not Playwright. */
  readReceiveDebugSnapshot: () => Promise<E2eArkadeReceiveDebugSnapshot>
  /** Wallet-secrets row via worker secrets channel — E2E diagnostics only. */
  readPersistedReceiveDebugSnapshot: (
    passwordOverride?: string,
  ) => Promise<E2eArkadePersistedReceiveDebugSnapshot>
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
    // Manual DevTools aid only — see E2eArkadeReceiveDebugSnapshot.
    readReceiveDebugSnapshot: async () => {
      const { getArkadeWorker } = await import('@/workers/arkade-factory')
      const { readOffchainNextDerivationIndex } = await import(
        '@/lib/arkade/arkade-payload-merge'
      )
      const worker = getArkadeWorker()
      const sdkPersistenceJson = await worker.exportSdkPersistenceJsonForE2e()
      return {
        offchainNextDerivationIndex: readOffchainNextDerivationIndex(sdkPersistenceJson),
        peekAddress: await worker.getAddress(),
      }
    },
    readPersistedReceiveDebugSnapshot: async (passwordOverride?: string) => {
      const { getDatabase, getWalletSecretsEncrypted } = await import('@/db')
      const { findActiveArkadeConnectionSummary } = await import(
        '@/lib/arkade/arkade-encrypted-persistence-manager'
      )
      const { readOffchainNextDerivationIndex } = await import(
        '@/lib/arkade/arkade-payload-merge'
      )
      const { getArkadeWorker } = await import('@/workers/arkade-factory')
      const { useWalletStore } = await import('@/stores/walletStore')
      const { useSessionStore } = await import('@/stores/sessionStore')
      const { isArkadeSupportedNetworkMode } = await import('@/lib/arkade/arkade-endpoints')
      const { ensureArkadeEncryptedSecretsHost } = await import(
        '@/workers/arkade-persistence-channel'
      )
      const { ensureArkadeWorkerSecretsChannel, ensureSecretsChannel } = await import(
        '@/workers/secrets-channel'
      )

      const walletId = useWalletStore.getState().activeWalletId
      const password = passwordOverride ?? useSessionStore.getState().password
      const networkMode = useWalletStore.getState().networkMode
      if (
        walletId == null ||
        password == null ||
        !isArkadeSupportedNetworkMode(networkMode)
      ) {
        throw new Error('Wallet must be unlocked on an Arkade network to read persisted snapshot')
      }

      await ensureSecretsChannel()
      await ensureArkadeEncryptedSecretsHost()
      await ensureArkadeWorkerSecretsChannel()
      getArkadeWorker()

      const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
      const connection = await findActiveArkadeConnectionSummary({
        password,
        walletId,
        networkMode,
        encryptedPayload: encrypted.payload,
      })
      if (connection == null) {
        throw new Error('No active Arkade operator connection in wallet secrets')
      }

      const sdkPersistenceJson = await getArkadeWorker().readPersistedSdkPersistenceJsonForE2e({
        password,
        walletId,
        connectionId: connection.id,
      })
      return {
        connectionId: connection.id,
        offchainNextDerivationIndex: readOffchainNextDerivationIndex(sdkPersistenceJson),
      }
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
