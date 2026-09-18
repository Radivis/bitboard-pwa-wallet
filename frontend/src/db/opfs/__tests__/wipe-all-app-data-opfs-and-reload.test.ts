import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const abortArkadeSessionForFactoryResetMock = vi.hoisted(() => vi.fn())
const closeArkadeSessionMock = vi.hoisted(() => vi.fn())
const destroyDatabaseMock = vi.hoisted(() => vi.fn())
const destroyLabDatabaseMock = vi.hoisted(() => vi.fn())
const removeOpfsRootEntryIfExistsWithRetryMock = vi.hoisted(() => vi.fn())
const awaitInFlightWalletSecretsWritesMock = vi.hoisted(() => vi.fn())
const awaitLabOperationQueueDrainedMock = vi.hoisted(() => vi.fn())
const terminateCryptoWorkerMock = vi.hoisted(() => vi.fn())
const terminateLabWorkerMock = vi.hoisted(() => vi.fn())
const resetSecretsChannelMock = vi.hoisted(() => vi.fn())
const toastSuccessMock = vi.hoisted(() => vi.fn())
const persistSoftBlockMock = vi.hoisted(() => vi.fn())
const hardBlockMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  abortArkadeSessionForFactoryReset: (...args: unknown[]) =>
    abortArkadeSessionForFactoryResetMock(...args),
  closeArkadeSession: (...args: unknown[]) => closeArkadeSessionMock(...args),
}))

vi.mock('@/db/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/database')>()
  return {
    ...actual,
    destroyDatabase: (...args: unknown[]) => destroyDatabaseMock(...args),
  }
})

vi.mock('@/db/lab-database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/lab-database')>()
  return {
    ...actual,
    destroyLabDatabase: (...args: unknown[]) => destroyLabDatabaseMock(...args),
  }
})

vi.mock('@/db/storage-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/storage-adapter')>()
  return {
    ...actual,
    blockSqliteStoragePersistForTeardown: () => {
      persistSoftBlockMock()
      actual.blockSqliteStoragePersistForTeardown()
    },
    blockWalletAndLabDatabaseAccessForTeardown: () => {
      hardBlockMock()
      actual.blockWalletAndLabDatabaseAccessForTeardown()
    },
  }
})

vi.mock('@/db/opfs/opfs-root-file', () => ({
  removeOpfsRootEntryIfExistsWithRetry: (...args: unknown[]) =>
    removeOpfsRootEntryIfExistsWithRetryMock(...args),
}))

vi.mock('@/db/wallet-secrets-write-tracker', () => ({
  awaitInFlightWalletSecretsWrites: (...args: unknown[]) =>
    awaitInFlightWalletSecretsWritesMock(...args),
}))

vi.mock('@/lib/lab/lab-coordinator', () => ({
  awaitLabOperationQueueDrained: (...args: unknown[]) =>
    awaitLabOperationQueueDrainedMock(...args),
}))

vi.mock('@/workers/crypto-factory', () => ({
  terminateCryptoWorker: (...args: unknown[]) => terminateCryptoWorkerMock(...args),
}))

vi.mock('@/workers/lab-factory', () => ({
  terminateLabWorker: (...args: unknown[]) => terminateLabWorkerMock(...args),
}))

vi.mock('@/workers/secrets-channel', () => ({
  resetSecretsChannel: (...args: unknown[]) => resetSecretsChannelMock(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: vi.fn(),
  },
}))

import { getDatabase } from '@/db/database'
import { resetSqliteStorageTeardownGuard } from '@/db/storage-adapter'
import { wipeAllAppDataOpfsAndReload } from '@/db/opfs/wipe-all-app-data-opfs-and-reload'

const wipeSourceByPath = import.meta.glob('../wipe-all-app-data-opfs-and-reload.ts', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

async function runWipeWithFakeTimers(): Promise<void> {
  const wipePromise = wipeAllAppDataOpfsAndReload()
  wipePromise.catch(() => undefined)
  await vi.runAllTimersAsync()
  await wipePromise
}

describe('wipeAllAppDataOpfsAndReload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('location', { reload: vi.fn() })
    abortArkadeSessionForFactoryResetMock.mockReset().mockResolvedValue(undefined)
    closeArkadeSessionMock.mockReset().mockResolvedValue(undefined)
    destroyDatabaseMock.mockReset().mockResolvedValue(undefined)
    destroyLabDatabaseMock.mockReset().mockResolvedValue(undefined)
    removeOpfsRootEntryIfExistsWithRetryMock.mockReset().mockResolvedValue(undefined)
    awaitInFlightWalletSecretsWritesMock.mockReset().mockResolvedValue(undefined)
    awaitLabOperationQueueDrainedMock.mockReset().mockResolvedValue(undefined)
    terminateCryptoWorkerMock.mockReset()
    terminateLabWorkerMock.mockReset()
    resetSecretsChannelMock.mockReset()
    toastSuccessMock.mockReset()
    persistSoftBlockMock.mockReset()
    hardBlockMock.mockReset()
    resetSqliteStorageTeardownGuard()
  })

  afterEach(() => {
    resetSqliteStorageTeardownGuard()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('wipe aborts Arkade without close/flush and hard-blocks after abort', async () => {
    const callOrder: string[] = []
    persistSoftBlockMock.mockImplementation(() => {
      callOrder.push('persistSoftBlock')
    })
    abortArkadeSessionForFactoryResetMock.mockImplementation(async () => {
      callOrder.push('abort')
    })
    hardBlockMock.mockImplementation(() => {
      callOrder.push('hardBlock')
    })
    destroyDatabaseMock.mockImplementation(async () => {
      callOrder.push('destroyDatabase')
    })

    await runWipeWithFakeTimers()

    expect(closeArkadeSessionMock).not.toHaveBeenCalled()
    expect(abortArkadeSessionForFactoryResetMock).toHaveBeenCalledTimes(1)
    expect(callOrder.indexOf('persistSoftBlock')).toBeGreaterThanOrEqual(0)
    expect(callOrder.indexOf('abort')).toBeGreaterThan(callOrder.indexOf('persistSoftBlock'))
    expect(callOrder.indexOf('hardBlock')).toBeGreaterThan(callOrder.indexOf('abort'))
    expect(callOrder.indexOf('destroyDatabase')).toBeGreaterThan(callOrder.indexOf('hardBlock'))
  })

  it('wipe continues to destroy when abort throws', async () => {
    abortArkadeSessionForFactoryResetMock.mockRejectedValueOnce(new Error('abort failed'))

    await runWipeWithFakeTimers()

    expect(abortArkadeSessionForFactoryResetMock).toHaveBeenCalledTimes(1)
    expect(destroyDatabaseMock).toHaveBeenCalledTimes(1)
    expect(closeArkadeSessionMock).not.toHaveBeenCalled()
  })

  it('wipe failure before destroy resets teardown guard', async () => {
    destroyDatabaseMock.mockRejectedValueOnce(new Error('destroy failed'))

    await expect(runWipeWithFakeTimers()).rejects.toThrow('destroy failed')

    expect(() => getDatabase()).not.toThrow(/blocked during teardown/i)
  })

  it('wipe failure after destroy leaves getDatabase blocked', async () => {
    removeOpfsRootEntryIfExistsWithRetryMock.mockRejectedValueOnce(new Error('opfs locked'))

    await expect(runWipeWithFakeTimers()).rejects.toThrow('opfs locked')

    expect(() => getDatabase()).toThrow(/blocked during teardown/i)
  })

  it('pre-destroy delay uses PRE_DESTROY_SETTLE_MS', () => {
    const wipeSource = Object.values(wipeSourceByPath)[0]
    expect(wipeSource).toMatch(/const PRE_DESTROY_SETTLE_MS = 100/)
    expect(wipeSource).toContain('preDestroyDelay(${PRE_DESTROY_SETTLE_MS}ms)')
    expect(wipeSource).toContain('waitMs(PRE_DESTROY_SETTLE_MS)')
    expect(wipeSource).not.toMatch(/setTimeout\(resolve,\s*100\)/)
  })
})
