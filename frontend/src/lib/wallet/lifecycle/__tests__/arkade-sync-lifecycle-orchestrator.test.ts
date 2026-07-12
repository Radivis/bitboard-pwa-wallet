import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncWithOperator = vi.fn()
const migrateDeprecatedSignerVtxos = vi.fn()
const refreshArkadeStoreFromLoadedWasm = vi.fn()
const orchestrateArkadeSave = vi.fn()
const loadPhaseRef = vi.hoisted(() => ({ phase: 'loaded' as string }))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    syncWithOperator,
    migrateDeprecatedSignerVtxos,
  }),
}))

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  refreshArkadeStoreFromLoadedWasm: (...args: unknown[]) =>
    refreshArkadeStoreFromLoadedWasm(...args),
}))

vi.mock('@/lib/arkade/arkade-utils', () => ({
  isArkadeActiveForNetworkMode: () => true,
}))

vi.mock('@/lib/arkade/arkade-endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/arkade/arkade-endpoints')>()
  return {
    ...actual,
    isArkadeSupportedNetworkMode: () => true,
  }
})

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  getArkadeLoadLifecycleSnapshot: () => ({ loadPhase: loadPhaseRef.phase, networkMode: 'signet', errorMessage: null }),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateArkadeSave: (...args: unknown[]) => orchestrateArkadeSave(...args),
    configureArkadeSaveForLoadedRail: actual.configureArkadeSaveForLoadedRail,
  }
})

import {
  awaitArkadeSyncQuiescence,
  configureArkadeSyncForLoadedRail,
  getArkadeSyncLifecycleSnapshot,
  orchestrateArkadeSyncThenSave,
  resetArkadeSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import type { ArkadeSignerMigrationResult } from '@/workers/arkade-api'

function completeMigrationResult(): ArkadeSignerMigrationResult {
  return {
    vtxoLeg: {
      migratedCount: 1,
      migratedSats: 1_000,
      deferredCount: 0,
      deferredSats: 0,
      oversizedCount: 0,
      oversizedSats: 0,
    },
    boardingLeg: {
      migratedCount: 0,
      migratedSats: 0,
      deferredCount: 0,
      deferredSats: 0,
      oversizedCount: 0,
      oversizedSats: 0,
    },
    passCount: 1,
    migrationComplete: true,
    passCapReached: false,
    remainingPreCutoffVtxoCount: 0,
    remainingPreCutoffSats: 0,
    remainingPreCutoffBoardingCount: 0,
    settleTxids: ['abc'],
  }
}

const syncParams = {
  walletId: 1,
  networkMode: 'signet' as const,
  connectionId: 'conn-1',
  syncKind: 'manual' as const,
}

describe('arkade-sync-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetArkadeSyncLifecycleStateForTests()
    vi.clearAllMocks()
    loadPhaseRef.phase = 'loaded'
    syncWithOperator.mockResolvedValue({})
    migrateDeprecatedSignerVtxos.mockResolvedValue(completeMigrationResult())
    refreshArkadeStoreFromLoadedWasm.mockResolvedValue(undefined)
    orchestrateArkadeSave.mockResolvedValue(undefined)
    configureArkadeSyncForLoadedRail({
      walletId: 1,
      networkMode: 'signet',
      connectionId: 'conn-1',
    })
  })

  it('sync rejected while loadPhase loading', async () => {
    loadPhaseRef.phase = 'loading'

    await expect(orchestrateArkadeSyncThenSave(syncParams)).rejects.toThrow(
      'Arkade sync cannot start while load is in progress',
    )
  })

  it('sync success syncing to not-syncing before save', async () => {
    const phases: string[] = []
    orchestrateArkadeSave.mockImplementation(async () => {
      phases.push(`save:${getArkadeSyncLifecycleSnapshot().syncPhase}`)
    })

    await orchestrateArkadeSyncThenSave(syncParams)

    expect(syncWithOperator).toHaveBeenCalled()
    expect(getArkadeSyncLifecycleSnapshot().syncPhase).toBe('not-syncing')
    expect(phases).toEqual(['save:not-syncing'])
    expect(orchestrateArkadeSave).toHaveBeenCalled()
  })

  it('sync failure sets sync-error without save', async () => {
    syncWithOperator.mockRejectedValue(new Error('operator down'))

    await expect(orchestrateArkadeSyncThenSave(syncParams)).rejects.toThrow('operator down')
    expect(getArkadeSyncLifecycleSnapshot().syncPhase).toBe('sync-error')
    expect(orchestrateArkadeSave).not.toHaveBeenCalled()
  })

  it('duplicate sync coalesces', async () => {
    let resolveSync!: () => void
    const syncGate = new Promise<void>((resolve) => {
      resolveSync = resolve
    })
    syncWithOperator.mockImplementation(async () => {
      await syncGate
      return {}
    })

    const first = orchestrateArkadeSyncThenSave(syncParams)
    const second = orchestrateArkadeSyncThenSave(syncParams)

    await vi.waitFor(() =>
      expect(getArkadeSyncLifecycleSnapshot().syncPhase).toBe('syncing'),
    )
    resolveSync!()
    await Promise.all([first, second])

    expect(syncWithOperator).toHaveBeenCalledTimes(1)
  })

  it('awaitArkadeSyncQuiescence propagates sync errors', async () => {
    let rejectSync!: (error: Error) => void
    syncWithOperator.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSync = reject
        }),
    )

    const syncPromise = orchestrateArkadeSyncThenSave(syncParams)
    await vi.waitFor(() =>
      expect(getArkadeSyncLifecycleSnapshot().syncPhase).toBe('syncing'),
    )
    const quiescencePromise = awaitArkadeSyncQuiescence()
    rejectSync(new Error('operator down'))

    await expect(syncPromise).rejects.toThrow('operator down')
    await expect(quiescencePromise).rejects.toThrow('operator down')
    expect(getArkadeSyncLifecycleSnapshot()).toEqual({
      syncPhase: 'sync-error',
      railScope: {
        walletId: 1,
        networkMode: 'signet',
        connectionId: 'conn-1',
      },
      errorMessage: 'operator down',
      warningMessage: null,
    })
  })

  it('key discovery failure sets warning without sync-error', async () => {
    syncWithOperator.mockResolvedValue({
      keyDiscoveryWarning:
        'Offchain receive keys could not be refreshed: indexer timeout. Balance may be incomplete until the next successful sync.',
    })

    await orchestrateArkadeSyncThenSave(syncParams)

    expect(getArkadeSyncLifecycleSnapshot()).toEqual({
      syncPhase: 'not-syncing',
      railScope: {
        walletId: 1,
        networkMode: 'signet',
        connectionId: 'conn-1',
      },
      errorMessage: null,
      warningMessage:
        'Offchain receive keys could not be refreshed: indexer timeout. Balance may be incomplete until the next successful sync.',
    })
    expect(orchestrateArkadeSave).toHaveBeenCalled()
  })

  it('successful sync clears previous warning', async () => {
    syncWithOperator.mockResolvedValueOnce({
      keyDiscoveryWarning: 'stale warning',
    })
    await orchestrateArkadeSyncThenSave(syncParams)
    syncWithOperator.mockResolvedValueOnce({})
    await orchestrateArkadeSyncThenSave(syncParams)

    expect(getArkadeSyncLifecycleSnapshot().warningMessage).toBeNull()
  })

  it('merges exiting VTXO warning with key discovery warning', async () => {
    syncWithOperator.mockResolvedValue({
      keyDiscoveryWarning: 'key warning',
      exitingVtxoWarning: 'exit warning',
    })

    await orchestrateArkadeSyncThenSave(syncParams)

    expect(getArkadeSyncLifecycleSnapshot().warningMessage).toBe(
      'key warning\nexit warning',
    )
  })

  it('signerMigration runs migrate before save and sync when complete', async () => {
    const callOrder: string[] = []
    migrateDeprecatedSignerVtxos.mockImplementation(async () => {
      callOrder.push('migrate')
      return completeMigrationResult()
    })
    syncWithOperator.mockImplementation(async () => {
      callOrder.push('sync')
    })
    orchestrateArkadeSave.mockImplementation(async () => {
      callOrder.push('save')
    })

    await orchestrateArkadeSyncThenSave({
      ...syncParams,
      syncKind: 'signerMigration',
    })

    expect(callOrder).toEqual(['migrate', 'save', 'sync'])
    expect(refreshArkadeStoreFromLoadedWasm).toHaveBeenCalledWith('conn-1')
  })

  it('coalesced signerMigration returns migration result to all callers', async () => {
    let resolveMigrate!: () => void
    const migrateGate = new Promise<void>((resolve) => {
      resolveMigrate = resolve
    })
    const incompleteResult = {
      ...completeMigrationResult(),
      migrationComplete: false,
      remainingPreCutoffVtxoCount: 2,
      remainingPreCutoffSats: 40_000,
    }
    migrateDeprecatedSignerVtxos.mockImplementation(async () => {
      await migrateGate
      return incompleteResult
    })

    const signerMigrationParams = {
      ...syncParams,
      syncKind: 'signerMigration' as const,
    }
    const first = orchestrateArkadeSyncThenSave(signerMigrationParams)
    const second = orchestrateArkadeSyncThenSave(signerMigrationParams)

    await vi.waitFor(() =>
      expect(getArkadeSyncLifecycleSnapshot().syncPhase).toBe('syncing'),
    )
    resolveMigrate!()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(migrateDeprecatedSignerVtxos).toHaveBeenCalledTimes(1)
    expect(firstResult).toMatchObject({ migrationComplete: false })
    expect(secondResult).toMatchObject({ migrationComplete: false })
  })

  it('signerMigration skips save when migration is incomplete', async () => {
    migrateDeprecatedSignerVtxos.mockResolvedValueOnce({
      ...completeMigrationResult(),
      migrationComplete: false,
      remainingPreCutoffVtxoCount: 1,
      remainingPreCutoffSats: 5_000,
    })

    const result = await orchestrateArkadeSyncThenSave({
      ...syncParams,
      syncKind: 'signerMigration',
    })

    expect(result).toMatchObject({ migrationComplete: false })
    expect(orchestrateArkadeSave).not.toHaveBeenCalled()
    expect(syncWithOperator).toHaveBeenCalled()
  })

  it('signerMigration saves after complete migrate even when post-migration operator sync fails', async () => {
    syncWithOperator.mockRejectedValueOnce(new Error('operator vtxos down'))

    await orchestrateArkadeSyncThenSave({
      ...syncParams,
      syncKind: 'signerMigration',
    })

    expect(migrateDeprecatedSignerVtxos).toHaveBeenCalled()
    expect(orchestrateArkadeSave).toHaveBeenCalled()
    expect(syncWithOperator).toHaveBeenCalled()
    expect(getArkadeSyncLifecycleSnapshot()).toEqual({
      syncPhase: 'sync-error',
      railScope: {
        walletId: 1,
        networkMode: 'signet',
        connectionId: 'conn-1',
      },
      errorMessage: 'operator vtxos down',
      warningMessage: null,
    })
  })

  it('signerMigration still throws when cooperative migration fails', async () => {
    migrateDeprecatedSignerVtxos.mockRejectedValueOnce(
      new Error('Ark client error: failed to get VTXOs for addresses: request failed'),
    )

    await expect(
      orchestrateArkadeSyncThenSave({
        ...syncParams,
        syncKind: 'signerMigration',
        throwOnError: true,
      }),
    ).rejects.toThrow(/failed to get VTXOs for addresses/)

    expect(orchestrateArkadeSave).not.toHaveBeenCalled()
    expect(syncWithOperator).not.toHaveBeenCalled()
  })
})
