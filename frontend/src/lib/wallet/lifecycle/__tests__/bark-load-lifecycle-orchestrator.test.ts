import { beforeEach, describe, expect, it, vi } from 'vitest'

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const workerMocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  closeSession: vi.fn(),
}))

const terminateBarkWorkerMock = vi.hoisted(() => vi.fn())
const closeBarkSessionMock = vi.hoisted(() => vi.fn())

const orchestrateBarkPostLoadSyncMock = vi.hoisted(() => vi.fn())
const forceResetBarkSyncLifecycleForTeardownMock = vi.hoisted(() => vi.fn())
const prepareBarkSyncForSessionOpenMock = vi.hoisted(() => vi.fn())
const rememberBarkPersistedSyncTimeMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator', () => ({
  orchestrateBarkPostLoadSync: (...args: unknown[]) => orchestrateBarkPostLoadSyncMock(...args),
  forceResetBarkSyncLifecycleForTeardown: (...args: unknown[]) =>
    forceResetBarkSyncLifecycleForTeardownMock(...args),
  prepareBarkSyncForSessionOpen: (...args: unknown[]) =>
    prepareBarkSyncForSessionOpenMock(...args),
  rememberBarkPersistedSyncTime: (...args: unknown[]) =>
    rememberBarkPersistedSyncTimeMock(...args),
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => workerMocks,
  terminateBarkWorker: (...args: unknown[]) => terminateBarkWorkerMock(...args),
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/workers/bark-persistence-channel', () => ({
  ensureBarkEncryptedSecretsHost: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/bark/bark-session-service', () => ({
  closeBarkSession: (...args: unknown[]) => closeBarkSessionMock(...args),
}))

import {
  getBarkLoadLifecycleSnapshot,
  orchestrateBarkLoad,
  orchestrateBarkRetryLoad,
  resetBarkLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'

describe('bark-load-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetBarkLoadLifecycleStateForTests()
    vi.clearAllMocks()
    featureState.isBarkEnabled = true
    workerMocks.openSession.mockResolvedValue({
      fingerprint: 'abcdef01',
      receiveKeyIndex: 0,
    })
    workerMocks.closeSession.mockResolvedValue(undefined)
    closeBarkSessionMock.mockResolvedValue(undefined)
  })

  it('opens a session when the flag is on and the network is signet', async () => {
    await orchestrateBarkLoad({ walletId: 1, networkMode: 'signet' })

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('loaded')
    expect(getBarkLoadLifecycleSnapshot().receiveKeyIndex).toBe(0)
    expect(workerMocks.openSession).toHaveBeenCalledWith({
      walletId: 1,
      encryptedMnemonic: expect.objectContaining({ kdfPhc: 'x' }),
      networkMode: 'signet',
    })
    expect(closeBarkSessionMock).not.toHaveBeenCalled()
    expect(orchestrateBarkPostLoadSyncMock).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'signet',
    })
    expect(rememberBarkPersistedSyncTimeMock).toHaveBeenCalledWith(null)
  })

  it('remembers a persisted sync time without blocking on the post-load sync', async () => {
    workerMocks.openSession.mockResolvedValue({
      fingerprint: 'abcdef01',
      receiveKeyIndex: 4,
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
    })

    await orchestrateBarkLoad({ walletId: 1, networkMode: 'signet' })

    expect(getBarkLoadLifecycleSnapshot().receiveKeyIndex).toBe(4)
    expect(rememberBarkPersistedSyncTimeMock).toHaveBeenCalledWith(
      '2024-03-01T12:00:00.000Z',
    )
    expect(orchestrateBarkPostLoadSyncMock).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'signet',
    })
  })

  it('closes without opening when the flag is off', async () => {
    featureState.isBarkEnabled = false

    await orchestrateBarkLoad({ walletId: 1, networkMode: 'signet' })

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('not-configured')
    expect(workerMocks.openSession).not.toHaveBeenCalled()
    expect(closeBarkSessionMock).toHaveBeenCalled()
    expect(orchestrateBarkPostLoadSyncMock).not.toHaveBeenCalled()
    expect(forceResetBarkSyncLifecycleForTeardownMock).toHaveBeenCalled()
  })

  it('opens a session when the flag is on and the network is mainnet', async () => {
    await orchestrateBarkLoad({ walletId: 1, networkMode: 'mainnet' })

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('loaded')
    expect(workerMocks.openSession).toHaveBeenCalledWith({
      walletId: 1,
      encryptedMnemonic: expect.objectContaining({ kdfPhc: 'x' }),
      networkMode: 'mainnet',
    })
  })

  it('closes without opening when the network is not signet or mainnet', async () => {
    await orchestrateBarkLoad({ walletId: 1, networkMode: 'testnet' })

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('not-configured')
    expect(workerMocks.openSession).not.toHaveBeenCalled()
    expect(closeBarkSessionMock).toHaveBeenCalled()
    expect(orchestrateBarkPostLoadSyncMock).not.toHaveBeenCalled()
  })

  it('terminates the worker when open fails', async () => {
    workerMocks.openSession.mockRejectedValueOnce(new Error('signet unreachable'))

    await expect(
      orchestrateBarkLoad({ walletId: 1, networkMode: 'signet' }),
    ).rejects.toThrow('signet unreachable')

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('load-error')
    expect(terminateBarkWorkerMock).toHaveBeenCalled()
    expect(orchestrateBarkPostLoadSyncMock).not.toHaveBeenCalled()
    expect(forceResetBarkSyncLifecycleForTeardownMock).toHaveBeenCalled()
  })

  it('retries a failed open through orchestrateBarkRetryLoad', async () => {
    workerMocks.openSession.mockRejectedValueOnce(new Error('signet unreachable'))
    await expect(
      orchestrateBarkLoad({ walletId: 1, networkMode: 'signet' }),
    ).rejects.toThrow('signet unreachable')
    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('load-error')

    workerMocks.openSession.mockResolvedValueOnce({
      fingerprint: 'abcdef01',
      receiveKeyIndex: 0,
    })
    await orchestrateBarkRetryLoad()

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('loaded')
    expect(workerMocks.openSession).toHaveBeenCalledTimes(2)
  })
})
