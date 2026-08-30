import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultUnilateralExitAutomationPrefs } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import { useUnilateralExitFailurePersistenceStore } from '@/lib/wallet/lifecycle/unilateral-exit-failure-persistence'
import {
  emptyPersistedUnilateralExitJob,
  useUnilateralExitLifecyclePersistenceStore,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import { arkadeWalletScopeKey } from '@/lib/arkade/arkade-session-scope'
import {
  UNILATERAL_EXIT_LIFECYCLE_SETTINGS_KEY,
  hydrateUnilateralExitFrontendPersistenceFromSdk,
  readZustandPersistedMap,
  removeScopeKeyFromZustandSettingsJson,
  resolveUnilateralExitFrontendBundle,
  scheduleUnilateralExitFailureSdkWrite,
  scheduleUnilateralExitJobSdkWrite,
  scheduleUnilateralExitPrefsSdkWrite,
} from '@/lib/wallet/lifecycle/unilateral-exit-frontend-sdk-persistence'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  connectionId: 'conn-1',
}

const otherScope = {
  walletId: 2,
  networkMode: 'regtest' as const,
  connectionId: 'conn-2',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

const settingsStore = new Map<string, string>()

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: vi.fn(async (key: string) => settingsStore.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      settingsStore.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      settingsStore.delete(key)
    }),
  },
}))

const getUnilateralExitFrontendPersistence = vi.fn()
const setUnilateralExitFrontendPersistence = vi.fn(async () => {})
const setUnilateralExitJob = vi.fn(async () => {})
const setUnilateralExitAutomationPrefs = vi.fn(async () => {})
const setUnilateralExitFailure = vi.fn(async () => {})

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    getUnilateralExitFrontendPersistence,
    setUnilateralExitFrontendPersistence,
    setUnilateralExitJob,
    setUnilateralExitAutomationPrefs,
    setUnilateralExitFailure,
  }),
}))

describe('unilateral-exit frontend sdk persistence overlay', () => {
  beforeEach(() => {
    settingsStore.clear()
    vi.clearAllMocks()
    useUnilateralExitLifecyclePersistenceStore.setState({ jobsByKey: {}, hydratedByKey: {} })
    useUnilateralExitAutomationPrefsStore.setState({ prefsByKey: {} })
    useUnilateralExitFailurePersistenceStore.setState({ failuresByKey: {} })
  })

  it('readZustandPersistedMap reads jobsByKey from a zustand persist envelope', () => {
    const raw = JSON.stringify({
      state: { jobsByKey: { '1:regtest:conn-1': { selectedLeafOutpoints: [leaf] } } },
      version: 5,
    })
    expect(readZustandPersistedMap(raw, 'jobsByKey')).toEqual({
      '1:regtest:conn-1': { selectedLeafOutpoints: [leaf] },
    })
  })

  it('removeScopeKeyFromZustandSettingsJson keeps leftover connection keys', () => {
    const scopeKey = arkadeWalletScopeKey(walletScope)
    const otherKey = arkadeWalletScopeKey(otherScope)
    const raw = JSON.stringify({
      state: {
        jobsByKey: {
          [scopeKey]: { selectedLeafOutpoints: [leaf] },
          [otherKey]: { selectedLeafOutpoints: [leaf] },
        },
      },
      version: 5,
    })
    const { nextJson, mapEmpty } = removeScopeKeyFromZustandSettingsJson(
      raw,
      'jobsByKey',
      scopeKey,
    )
    expect(mapEmpty).toBe(false)
    expect(nextJson).not.toBeNull()
    const remaining = readZustandPersistedMap(nextJson, 'jobsByKey')
    expect(remaining[scopeKey]).toBeUndefined()
    expect(remaining[otherKey]).toEqual({ selectedLeafOutpoints: [leaf] })
  })

  it('removeScopeKeyFromZustandSettingsJson returns empty when the last key is removed', () => {
    const scopeKey = arkadeWalletScopeKey(walletScope)
    const raw = JSON.stringify({
      state: { jobsByKey: { [scopeKey]: { selectedLeafOutpoints: [leaf] } } },
      version: 5,
    })
    const { nextJson, mapEmpty } = removeScopeKeyFromZustandSettingsJson(
      raw,
      'jobsByKey',
      scopeKey,
    )
    expect(mapEmpty).toBe(true)
    expect(nextJson).toBeNull()
  })

  it('resolveUnilateralExitFrontendBundle overlays settings only when WASM is null', () => {
    const fromSettings = resolveUnilateralExitFrontendBundle({
      wasmBundle: null,
      settingsJob: {
        selectedLeafOutpoints: [leaf],
        jobActive: true,
        currentStepRelayedSinceUnix: 1_700_000_000,
        jobStartedAtUnix: 1_700_000_000,
      },
      settingsPrefs: { enabled: true, feePresetLabel: 'High', maxFeeRateSatPerVb: 20 },
    })
    expect(fromSettings.didOverlay).toBe(true)
    expect(fromSettings.bundle.job.selectedLeafOutpoints).toEqual([leaf])
    expect(fromSettings.bundle.automationPrefs.enabled).toBe(true)

    const wasmEmptyJob = resolveUnilateralExitFrontendBundle({
      wasmBundle: {
        job: {
          selectedLeafOutpoints: [],
          currentStepRelayedSinceUnix: null,
          jobStartedAtUnix: null,
        },
        automationPrefs: defaultUnilateralExitAutomationPrefs(),
        lastFailure: null,
      },
      settingsJob: {
        selectedLeafOutpoints: [leaf],
        jobActive: true,
        jobStartedAtUnix: 1_700_000_000,
      },
    })
    expect(wasmEmptyJob.didOverlay).toBe(false)
    expect(wasmEmptyJob.bundle.job.selectedLeafOutpoints).toEqual([])
  })

  it('hydrate overlays settings when WASM is null and deletes only this scope key', async () => {
    const scopeKey = arkadeWalletScopeKey(walletScope)
    const otherKey = arkadeWalletScopeKey(otherScope)
    settingsStore.set(
      UNILATERAL_EXIT_LIFECYCLE_SETTINGS_KEY,
      JSON.stringify({
        state: {
          jobsByKey: {
            [scopeKey]: {
              selectedLeafOutpoints: [leaf],
              jobActive: true,
              jobStartedAtUnix: 1_700_000_000,
              currentStepRelayedSinceUnix: null,
            },
            [otherKey]: {
              selectedLeafOutpoints: [leaf],
              jobActive: true,
              jobStartedAtUnix: 1_600_000_000,
            },
          },
        },
        version: 5,
      }),
    )
    getUnilateralExitFrontendPersistence.mockResolvedValue(null)

    const job = await hydrateUnilateralExitFrontendPersistenceFromSdk(walletScope)

    expect(job.selectedLeafOutpoints).toEqual([leaf])
    expect(setUnilateralExitFrontendPersistence).toHaveBeenCalled()
    expect(
      useUnilateralExitLifecyclePersistenceStore.getState().isHydrated(walletScope),
    ).toBe(true)
    const remainingJobs = readZustandPersistedMap(
      settingsStore.get(UNILATERAL_EXIT_LIFECYCLE_SETTINGS_KEY) ?? null,
      'jobsByKey',
    )
    expect(remainingJobs[scopeKey]).toBeUndefined()
    expect(remainingJobs[otherKey]).toBeDefined()
  })

  it('hydrate does not resurrect a settings job when WASM already has an empty job', async () => {
    const scopeKey = arkadeWalletScopeKey(walletScope)
    settingsStore.set(
      UNILATERAL_EXIT_LIFECYCLE_SETTINGS_KEY,
      JSON.stringify({
        state: {
          jobsByKey: {
            [scopeKey]: {
              selectedLeafOutpoints: [leaf],
              jobActive: true,
              jobStartedAtUnix: 1_700_000_000,
            },
          },
        },
        version: 5,
      }),
    )
    getUnilateralExitFrontendPersistence.mockResolvedValue({
      job: {
        selectedLeafOutpoints: [],
        currentStepRelayedSinceUnix: null,
        jobStartedAtUnix: null,
      },
      automationPrefs: defaultUnilateralExitAutomationPrefs(),
      lastFailure: null,
    })

    const job = await hydrateUnilateralExitFrontendPersistenceFromSdk(walletScope)

    expect(job).toEqual(emptyPersistedUnilateralExitJob)
    expect(setUnilateralExitFrontendPersistence).not.toHaveBeenCalled()
    expect(settingsStore.get(UNILATERAL_EXIT_LIFECYCLE_SETTINGS_KEY)).toBeUndefined()
  })

  it('hydrate passes walletScope to persistence get and overlay set', async () => {
    getUnilateralExitFrontendPersistence.mockResolvedValue(null)

    await hydrateUnilateralExitFrontendPersistenceFromSdk(walletScope)

    expect(getUnilateralExitFrontendPersistence).toHaveBeenCalledWith(walletScope)
    expect(setUnilateralExitFrontendPersistence).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({
        job: expect.objectContaining({ selectedLeafOutpoints: [] }),
      }),
    )
  })

  it('scheduleUnilateralExitJobSdkWrite passes walletScope to worker', async () => {
    const job = {
      selectedLeafOutpoints: [leaf],
      currentStepRelayedSinceUnix: null,
      jobStartedAtUnix: 1_700_000_000,
    }
    useUnilateralExitLifecyclePersistenceStore.getState().hydrateJob(walletScope, job)

    scheduleUnilateralExitJobSdkWrite(walletScope)
    await vi.waitFor(() =>
      expect(setUnilateralExitJob).toHaveBeenCalledWith(
        walletScope,
        expect.objectContaining({ selectedLeafOutpoints: [leaf] }),
      ),
    )
  })

  it('queued SDK job writes apply the latest memory snapshot so a later clear wins', async () => {
    const completedJobs: Array<{ selectedLeafOutpoints: unknown[] }> = []
    let releaseFirstWrite: (() => void) | undefined
    let firstWriteStarted = false
    const firstWriteStartedPromise = new Promise<void>((resolve) => {
      setUnilateralExitJob.mockImplementation(async (_scope, job) => {
        const isFirstWrite = !firstWriteStarted
        firstWriteStarted = true
        if (isFirstWrite) {
          resolve()
          await new Promise<void>((release) => {
            releaseFirstWrite = release
          })
        }
        completedJobs.push(job)
      })
    })
    const job = {
      selectedLeafOutpoints: [leaf],
      currentStepRelayedSinceUnix: 1_700_000_000,
      jobStartedAtUnix: 1_700_000_000,
    }
    useUnilateralExitLifecyclePersistenceStore.getState().hydrateJob(walletScope, job)
    scheduleUnilateralExitJobSdkWrite(walletScope)
    await firstWriteStartedPromise

    useUnilateralExitLifecyclePersistenceStore.getState().clearJob(walletScope)
    scheduleUnilateralExitJobSdkWrite(walletScope)
    await Promise.resolve()
    releaseFirstWrite?.()

    await vi.waitFor(() => expect(completedJobs).toHaveLength(2))
    expect(completedJobs[1]).toEqual(
      expect.objectContaining({ selectedLeafOutpoints: [] }),
    )
  })

  it('scheduleUnilateralExitPrefsSdkWrite passes walletScope to worker', async () => {
    useUnilateralExitAutomationPrefsStore.getState().hydratePrefs(walletScope, {
      enabled: true,
      feePresetLabel: 'High',
      maxFeeRateSatPerVb: 20,
    })

    scheduleUnilateralExitPrefsSdkWrite(walletScope)
    await vi.waitFor(() =>
      expect(setUnilateralExitAutomationPrefs).toHaveBeenCalledWith(
        walletScope,
        expect.objectContaining({ enabled: true, maxFeeRateSatPerVb: 20 }),
      ),
    )
  })

  it('scheduleUnilateralExitFailureSdkWrite passes walletScope to worker', async () => {
    const failure = {
      selectedLeafOutpoints: [leaf],
      jobStartedAtUnix: 1_700_000_000,
      detectedAtUnix: 1_700_000_100,
      reasonCode: 'user_aborted' as const,
      detailMessage: 'aborted',
      vtxoIds: ['vtxo-1'],
    }
    useUnilateralExitFailurePersistenceStore.getState().hydrateFailure(walletScope, failure)

    scheduleUnilateralExitFailureSdkWrite(walletScope)
    await vi.waitFor(() =>
      expect(setUnilateralExitFailure).toHaveBeenCalledWith(
        walletScope,
        expect.objectContaining({ reasonCode: 'user_aborted', vtxoIds: ['vtxo-1'] }),
      ),
    )
  })
})
