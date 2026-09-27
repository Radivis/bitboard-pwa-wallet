import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWalletStore } from '@/stores/walletStore'

const discardArkadeSessionForWalletDeletion = vi.hoisted(() => vi.fn())
const closeArkadeSession = vi.hoisted(() => vi.fn())

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  discardArkadeSessionForWalletDeletion,
  closeArkadeSession,
}))

vi.mock('@/db/wallet-secrets-write-tracker', () => ({
  awaitInFlightWalletSecretsWrites: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/lightning/lightning-connections-hydration', () => ({
  removeLightningConnectionsHydrationQueries: vi.fn(),
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  removeOnchainDashboardQueries: vi.fn(),
}))

vi.mock('@/workers/secrets-channel', () => ({
  resetSecretsChannel: vi.fn(),
}))

const terminateWorker = vi.hoisted(() => vi.fn())

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({ terminateWorker }),
  },
}))

import { finalizeWalletDeletion } from '@/lib/wallet/wallet-delete-finalize'

describe('finalizeWalletDeletion', () => {
  beforeEach(() => {
    discardArkadeSessionForWalletDeletion.mockReset()
    discardArkadeSessionForWalletDeletion.mockResolvedValue(undefined)
    closeArkadeSession.mockReset()
    terminateWorker.mockReset()
    useWalletStore.getState().resetWallet()
    useWalletStore.getState().setActiveWallet(2)
  })

  it('tears down the crypto worker without discarding Arkade again', async () => {
    await finalizeWalletDeletion({
      deletedWalletId: 2,
      wasActiveWallet: true,
      nextActiveWalletId: 1,
    })

    expect(discardArkadeSessionForWalletDeletion).not.toHaveBeenCalled()
    expect(closeArkadeSession).not.toHaveBeenCalled()
    expect(useWalletStore.getState().activeWalletId).toBe(1)
    expect(useWalletStore.getState().walletStatus).toBe('locked')
    expect(terminateWorker).toHaveBeenCalledTimes(1)
  })
})
