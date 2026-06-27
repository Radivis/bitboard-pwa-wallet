import { beforeEach, describe, expect, it, vi } from 'vitest'

const refreshArkadeStoreFromLoadedWasmMock = vi.hoisted(() => vi.fn())
const setActiveArkadeConnectionIdMock = vi.hoisted(() => vi.fn())
const setLastOperatorSyncTimeMock = vi.hoisted(() => vi.fn())
const setArkadeSignerMigrationHintMock = vi.hoisted(() => vi.fn())
const getArkadeWorkerIfExistsMock = vi.hoisted(() => vi.fn())
const workerMocks = vi.hoisted(() => ({
  hasOpenSession: vi.fn(),
  reconcileActiveConnectionId: vi.fn(),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setActiveArkadeConnectionId: setActiveArkadeConnectionIdMock,
      setLastOperatorSyncTime: setLastOperatorSyncTimeMock,
      setArkadeSignerMigrationHint: setArkadeSignerMigrationHintMock,
    }),
  },
}))

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  refreshArkadeStoreFromLoadedWasm: (...args: unknown[]) =>
    refreshArkadeStoreFromLoadedWasmMock(...args),
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorkerIfExists: (...args: unknown[]) => getArkadeWorkerIfExistsMock(...args),
}))

import {
  hydrateArkadeDashboardAfterSessionOpen,
  tryReuseExistingArkadeSession,
  type ArkadeSessionReuseState,
} from '@/lib/wallet/lifecycle/arkade-session-open-helpers'

const TEST_CONNECTION = {
  id: 'conn-helper-test',
  label: 'signet',
  networkMode: 'signet' as const,
  operatorUrl: 'https://asp.example',
  operatorSignerPkHex: '02deadbeef',
  createdAt: '2020-01-01T00:00:00.000Z',
}

function createSessionReuseState(initialKey: string | null = null): ArkadeSessionReuseState {
  let key = initialKey
  return {
    get lastOpenedSessionKey() {
      return key
    },
    setLastOpenedSessionKey(nextKey) {
      key = nextKey
    },
  }
}

describe('arkade-session-open-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refreshArkadeStoreFromLoadedWasmMock.mockResolvedValue(undefined)
    workerMocks.hasOpenSession.mockResolvedValue(true)
    workerMocks.reconcileActiveConnectionId.mockResolvedValue(undefined)
    getArkadeWorkerIfExistsMock.mockReturnValue(workerMocks)
  })

  it('tryReuseExistingArkadeSession returns connection id when session is already open', async () => {
    const sessionReuseState = createSessionReuseState('7:signet:conn-helper-test')

    const connectionId = await tryReuseExistingArkadeSession({
      walletId: 7,
      networkMode: 'signet',
      connection: TEST_CONNECTION,
      sessionReuseState,
    })

    expect(connectionId).toBe(TEST_CONNECTION.id)
    expect(refreshArkadeStoreFromLoadedWasmMock).toHaveBeenCalledWith(TEST_CONNECTION.id)
    expect(setActiveArkadeConnectionIdMock).toHaveBeenCalledWith(TEST_CONNECTION.id)
  })

  it('tryReuseExistingArkadeSession returns null when session key does not match', async () => {
    const connectionId = await tryReuseExistingArkadeSession({
      walletId: 7,
      networkMode: 'signet',
      connection: TEST_CONNECTION,
      sessionReuseState: createSessionReuseState('other-key'),
    })

    expect(connectionId).toBeNull()
    expect(workerMocks.hasOpenSession).not.toHaveBeenCalled()
  })

  it('hydrateArkadeDashboardAfterSessionOpen updates store and schedules maintenance', async () => {
    const sessionReuseState = createSessionReuseState()
    const runPostOpenMaintenance = vi.fn().mockResolvedValue(undefined)

    await hydrateArkadeDashboardAfterSessionOpen({
      worker: workerMocks,
      walletId: 7,
      networkMode: 'signet',
      connectionId: TEST_CONNECTION.id,
      signerMigrationHint: {
        previousSignerPkHex: '02deadbeef',
        deprecatedStatus: 'deprecated',
        cutoffUnix: 1_700_000_000,
      },
      sessionReuseState,
      runPostOpenMaintenance,
    })

    expect(setArkadeSignerMigrationHintMock).toHaveBeenCalledWith({
      previousSignerPkHex: '02deadbeef',
      deprecatedStatus: 'deprecated',
      cutoffUnix: 1_700_000_000,
    })
    expect(workerMocks.reconcileActiveConnectionId).toHaveBeenCalledWith(TEST_CONNECTION.id)
    expect(setActiveArkadeConnectionIdMock).toHaveBeenCalledWith(TEST_CONNECTION.id)
    expect(sessionReuseState.lastOpenedSessionKey).toBe('7:signet:conn-helper-test')
    expect(runPostOpenMaintenance).toHaveBeenCalledWith(workerMocks, 'signet')
  })
})
