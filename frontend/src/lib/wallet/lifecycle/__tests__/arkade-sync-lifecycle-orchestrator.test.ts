import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncWithOperator = vi.fn()
const refreshArkadeStoreFromLoadedWasm = vi.fn()
const orchestrateArkadeSave = vi.fn()
const loadPhaseRef = vi.hoisted(() => ({ phase: 'loaded' as string }))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    syncWithOperator,
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
  getArkadeLoadLifecycleSnapshot: () => ({ loadPhase: loadPhaseRef.phase, networkMode: 'signet' }),
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

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

import {
  configureArkadeSyncForLoadedRail,
  getArkadeSyncLifecycleSnapshot,
  orchestrateArkadeSyncThenSave,
  resetArkadeSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'

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
    syncWithOperator.mockResolvedValue(undefined)
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
    syncWithOperator.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSync = resolve
        }),
    )

    const first = orchestrateArkadeSyncThenSave(syncParams)
    const second = orchestrateArkadeSyncThenSave(syncParams)
    resolveSync!()
    await Promise.all([first, second])

    expect(syncWithOperator).toHaveBeenCalledTimes(1)
  })
})
