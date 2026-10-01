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
    })
    expect(closeBarkSessionMock).not.toHaveBeenCalled()
  })

  it('closes without opening when the flag is off', async () => {
    featureState.isBarkEnabled = false

    await orchestrateBarkLoad({ walletId: 1, networkMode: 'signet' })

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('not-configured')
    expect(workerMocks.openSession).not.toHaveBeenCalled()
    expect(closeBarkSessionMock).toHaveBeenCalled()
  })

  it('closes without opening when the network is not signet', async () => {
    await orchestrateBarkLoad({ walletId: 1, networkMode: 'testnet' })

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('not-configured')
    expect(workerMocks.openSession).not.toHaveBeenCalled()
    expect(closeBarkSessionMock).toHaveBeenCalled()
  })

  it('terminates the worker when open fails', async () => {
    workerMocks.openSession.mockRejectedValueOnce(new Error('signet unreachable'))

    await expect(
      orchestrateBarkLoad({ walletId: 1, networkMode: 'signet' }),
    ).rejects.toThrow('signet unreachable')

    expect(getBarkLoadLifecycleSnapshot().loadPhase).toBe('load-error')
    expect(terminateBarkWorkerMock).toHaveBeenCalled()
  })
})
