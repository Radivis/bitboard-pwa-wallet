import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}))

const loadActiveArkadeConnectionForNetworkMock = vi.fn()
const removeQueriesMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    invalidateQueries: vi.fn(),
    removeQueries: (...args: unknown[]) => removeQueriesMock(...args),
  },
}))

vi.mock('@/lib/arkade/arkade-operator-connections', () => ({
  loadActiveArkadeConnectionForNetwork: (...args: unknown[]) =>
    loadActiveArkadeConnectionForNetworkMock(...args),
}))

vi.mock('@/db/database', () => ({
  ensureMigrated: vi.fn(async () => undefined),
}))

import { useWalletStore } from '@/stores/walletStore'
import {
  ARKADE_DASHBOARD_QUERY_KEY,
  removeArkadeDashboardSyncQueries,
  resolveArkadeOperatorSyncMetadata,
} from '@/lib/arkade/arkade-dashboard-sync'

describe('resolveArkadeOperatorSyncMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      networkMode: 'signet',
      activeWalletId: 1,
      walletStatus: 'unlocked',
      activeArkadeConnectionId: 'conn-1',
      lastOperatorSyncTime: null,
      arkadeBalance: { confirmedSats: 1000, totalSats: 1000 },
      arkadePayments: [],
      arkadeReceiveAddress: 'tark1qtest',
    })
  })

  it('returns not stale when lastOperatorSyncTime is set this session', async () => {
    useWalletStore.setState({ lastOperatorSyncTime: new Date() })
    const result = await resolveArkadeOperatorSyncMetadata()
    expect(result.isStaleArkade).toBe(false)
    expect(loadActiveArkadeConnectionForNetworkMock).not.toHaveBeenCalled()
  })

  it('returns stale when persisted operator sync timestamp exists on connection', async () => {
    const isoTimestamp = '2020-01-02T00:00:00.000Z'
    loadActiveArkadeConnectionForNetworkMock.mockResolvedValue({
      id: 'conn-1',
      lastSuccessfulOperatorSyncAt: isoTimestamp,
    })
    const result = await resolveArkadeOperatorSyncMetadata()
    expect(result.isStaleArkade).toBe(true)
    expect(result.lastSuccessfulOperatorSyncAt).toBe(isoTimestamp)
  })

  it('returns not stale when connection has no prior operator sync', async () => {
    loadActiveArkadeConnectionForNetworkMock.mockResolvedValue({ id: 'conn-1' })
    const result = await resolveArkadeOperatorSyncMetadata()
    expect(result.isStaleArkade).toBe(false)
  })
})

describe('removeArkadeDashboardSyncQueries', () => {
  it('removes cached arkade dashboard query entries', () => {
    removeArkadeDashboardSyncQueries()
    expect(removeQueriesMock).toHaveBeenCalledWith({
      queryKey: ARKADE_DASHBOARD_QUERY_KEY,
    })
  })
})
