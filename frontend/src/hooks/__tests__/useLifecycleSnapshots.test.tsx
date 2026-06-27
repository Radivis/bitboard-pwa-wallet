import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  markOnchainRailLoadedAfterExternalHydration,
  resetOnchainLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  orchestrateOnchainSyncThenSave,
  resetOnchainSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { resetOnchainSaveLifecycleStateForTests } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import {
  orchestrateArkadeLoad,
  resetArkadeLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  resetArkadeSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { resetArkadeSaveLifecycleStateForTests } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import {
  resetLightningSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import {
  useOnchainLoadLifecycleSnapshot,
  useOnchainRailSnapshot,
} from '@/hooks/useOnchainLifecycleSnapshots'
import { useIsArkadeSessionReady } from '@/hooks/useArkadeLifecycleSnapshots'
import { useAnyRailSyncing } from '@/hooks/useWalletRailSyncAggregate'
import { AddressType } from '@/stores/walletStore'

const syncActiveWalletAndUpdateState = vi.fn()
const orchestrateOnchainSave = vi.fn()
const tryReuseExistingArkadeSession = vi.fn()

vi.mock('@/lib/wallet/wallet-utils', () => ({
  syncActiveWalletAndUpdateState: (...args: unknown[]) =>
    syncActiveWalletAndUpdateState(...args),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    configureOnchainSaveForLoadedRail: vi.fn(),
    orchestrateOnchainSave: (...args: unknown[]) => orchestrateOnchainSave(...args),
  }
})

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn().mockResolvedValue(undefined),
  ensureArkadeWorkerSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/workers/arkade-persistence-channel', () => ({
  ensureArkadeEncryptedSecretsHost: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db', () => ({
  getDatabase: vi.fn(() => ({})),
  getWalletSecretsEncrypted: vi.fn(async () => ({
    mnemonic: {
      ciphertext: new Uint8Array(),
      iv: new Uint8Array(),
      salt: new Uint8Array(),
      kdfPhc: 'x',
    },
    payload: {
      ciphertext: new Uint8Array(),
      iv: new Uint8Array(),
      salt: new Uint8Array(),
      kdfPhc: 'x',
    },
  })),
}))

vi.mock('@/lib/arkade/arkade-operator-connections', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/arkade/arkade-operator-connections')
  >()
  return {
    ...actual,
    findActiveArkadeConnectionSummary: vi.fn().mockResolvedValue({
      id: 'conn-hook-test',
      networkMode: 'signet',
    }),
  }
})

vi.mock('@/lib/wallet/lifecycle/arkade-session-open-helpers', () => ({
  tryReuseExistingArkadeSession: (...args: unknown[]) =>
    tryReuseExistingArkadeSession(...args),
  openFreshArkadeWorkerSession: vi.fn(),
  hydrateArkadeDashboardAfterSessionOpen: vi.fn(),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateArkadePostLoadSync: vi.fn(),
  }
})

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => ({ isArkadeEnabled: true, isMainnetAccessEnabled: false }),
  },
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: {
      getState: () => ({
        walletStatus: 'unlocked' as const,
        clearArkadeDashboardState: vi.fn(),
        setActiveArkadeConnectionId: vi.fn(),
        setLastOperatorSyncTime: vi.fn(),
        setArkadeSignerMigrationHint: vi.fn(),
      }),
    },
  }
})

const onchainScope = {
  walletId: 1,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
}

describe('lifecycle snapshot hooks', () => {
  beforeEach(() => {
    resetOnchainLoadLifecycleStateForTests()
    resetOnchainSyncLifecycleStateForTests()
    resetOnchainSaveLifecycleStateForTests()
    resetArkadeLoadLifecycleStateForTests()
    resetArkadeSyncLifecycleStateForTests()
    resetArkadeSaveLifecycleStateForTests()
    resetLightningSyncLifecycleStateForTests()
    vi.clearAllMocks()
    syncActiveWalletAndUpdateState.mockResolvedValue(undefined)
    orchestrateOnchainSave.mockResolvedValue(undefined)
    tryReuseExistingArkadeSession.mockResolvedValue('conn-hook-test')
  })

  it('useOnchainLoadLifecycleSnapshot updates after external hydration mark', () => {
    const { result } = renderHook(() => useOnchainLoadLifecycleSnapshot())

    expect(result.current.loadPhase).toBe('not-configured')

    act(() => {
      markOnchainRailLoadedAfterExternalHydration(onchainScope)
    })

    expect(result.current.loadPhase).toBe('loaded')
    expect(result.current.networkMode).toBe('testnet')
  })

  it('useOnchainRailSnapshot collapses not-configured when load not-configured', () => {
    const { result } = renderHook(() => useOnchainRailSnapshot())

    expect(result.current).toEqual({
      loadPhase: 'not-configured',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    })
  })

  it('useIsArkadeSessionReady true only when loadPhase loaded', async () => {
    const { result } = renderHook(() => useIsArkadeSessionReady())

    expect(result.current).toBe(false)

    await act(async () => {
      await orchestrateArkadeLoad({ walletId: 1, networkMode: 'signet' })
    })

    expect(result.current).toBe(true)
  })

  it('useAnyRailSyncing true when any rail syncing', async () => {
    markOnchainRailLoadedAfterExternalHydration(onchainScope)

    let resolveSync!: () => void
    const syncGate = new Promise<void>((resolve) => {
      resolveSync = resolve
    })
    syncActiveWalletAndUpdateState.mockImplementation(() => syncGate)

    const { result } = renderHook(() => useAnyRailSyncing())

    expect(result.current).toBe(false)

    const syncPromise = orchestrateOnchainSyncThenSave({
      ...onchainScope,
      syncKind: 'incrementalDashboard',
      useFullScan: false,
      markFullScanDone: false,
    })

    await waitFor(() => expect(result.current).toBe(true))

    resolveSync()
    await syncPromise

    await waitFor(() => expect(result.current).toBe(false))
  })
})
