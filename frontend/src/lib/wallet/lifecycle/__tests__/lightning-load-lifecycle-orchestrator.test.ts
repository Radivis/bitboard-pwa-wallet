import { beforeEach, describe, expect, it, vi } from 'vitest'

const featureEnabledRef = vi.hoisted(() => ({ enabled: true }))
const walletNetworkModeRef = vi.hoisted(() => ({ networkMode: 'signet' as const }))
const loadLightningConnectionsForWallet = vi.fn()
const replaceConnectionsForWallet = vi.fn()
const orchestrateLightningPostLoadSync = vi.fn()

vi.mock('@/lib/lightning/lightning-wallet-secrets', () => ({
  loadLightningConnectionsForWallet: (...args: unknown[]) =>
    loadLightningConnectionsForWallet(...args),
}))

vi.mock('@/stores/lightningStore', () => ({
  useLightningStore: {
    getState: () => ({
      replaceConnectionsForWallet,
    }),
  },
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => ({ isLightningEnabled: featureEnabledRef.enabled }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ networkMode: walletNetworkModeRef.networkMode }),
  },
}))

vi.mock('@/lib/lightning/lightning-utils', () => ({
  isLightningSupported: (networkMode: string) => networkMode === 'signet',
}))

vi.mock('@/lib/lightning/lightning-connection-utils', () => ({
  getMatchingLightningConnectionsForDashboard: () => [{ id: 'conn-1' }],
}))

vi.mock('@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator', () => ({
  configureLightningSyncForLoadedRail: vi.fn(),
  orchestrateLightningPostLoadSync: (...args: unknown[]) =>
    orchestrateLightningPostLoadSync(...args),
}))

import {
  getLightningLoadLifecycleSnapshot,
  orchestrateLightningLoad,
  reloadLightningRailAfterConnectionsChanged,
  resetLightningLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'

const loadParams = {
  walletId: 1,
  networkMode: 'signet' as const,
}

describe('lightning-load-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetLightningLoadLifecycleStateForTests()
    featureEnabledRef.enabled = true
    walletNetworkModeRef.networkMode = 'signet'
    vi.clearAllMocks()
    orchestrateLightningPostLoadSync.mockResolvedValue(undefined)
  })

  it('load hydrates store from secrets', async () => {
    loadLightningConnectionsForWallet.mockResolvedValue([
      { id: 'conn-1', walletId: 1, label: 'Hub', networkMode: 'signet' },
    ])

    await orchestrateLightningLoad(loadParams)

    expect(replaceConnectionsForWallet).toHaveBeenCalledWith(1, [
      { id: 'conn-1', walletId: 1, label: 'Hub', networkMode: 'signet' },
    ])
    expect(getLightningLoadLifecycleSnapshot().loadPhase).toBe('loaded')
  })

  it('zero connections → not-configured', async () => {
    loadLightningConnectionsForWallet.mockResolvedValue([])

    await orchestrateLightningLoad(loadParams)

    expect(getLightningLoadLifecycleSnapshot().loadPhase).toBe('not-configured')
    expect(orchestrateLightningPostLoadSync).not.toHaveBeenCalled()
  })

  it('feature off → not-configured', async () => {
    featureEnabledRef.enabled = false

    await orchestrateLightningLoad(loadParams)

    expect(loadLightningConnectionsForWallet).not.toHaveBeenCalled()
    expect(getLightningLoadLifecycleSnapshot().loadPhase).toBe('not-configured')
  })

  it('unsupported network → not-configured', async () => {
    await orchestrateLightningLoad({ walletId: 1, networkMode: 'lab' })

    expect(loadLightningConnectionsForWallet).not.toHaveBeenCalled()
    expect(getLightningLoadLifecycleSnapshot().loadPhase).toBe('not-configured')
  })

  it('load success schedules post-load sync', async () => {
    loadLightningConnectionsForWallet.mockResolvedValue([
      { id: 'conn-1', walletId: 1, label: 'Hub', networkMode: 'signet' },
    ])

    await orchestrateLightningLoad(loadParams)

    expect(orchestrateLightningPostLoadSync).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 1,
        networkMode: 'signet',
        onSyncError: expect.any(Function),
      }),
    )
  })

  it('reloadLightningRailAfterConnectionsChanged loads rail after first connect', async () => {
    loadLightningConnectionsForWallet.mockResolvedValueOnce([])
    await orchestrateLightningLoad(loadParams)
    expect(getLightningLoadLifecycleSnapshot().loadPhase).toBe('not-configured')

    loadLightningConnectionsForWallet.mockResolvedValueOnce([
      { id: 'conn-1', walletId: 1, label: 'Hub', networkMode: 'signet' },
    ])
    await reloadLightningRailAfterConnectionsChanged(1)

    expect(getLightningLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
    })
    expect(loadLightningConnectionsForWallet).toHaveBeenLastCalledWith({ walletId: 1 })
  })
})
