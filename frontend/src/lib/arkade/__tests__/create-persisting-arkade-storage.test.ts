import { describe, expect, it } from 'vitest'
import { InMemoryWalletRepository } from '@arkade-os/sdk'
import { createPersistingArkadeStorage } from '@/lib/arkade/storage/create-persisting-arkade-storage'
import {
  exportBitboardArkadeSdkPersistence,
  stringifyBitboardArkadeSdkPersistence,
} from '@/lib/arkade/storage/arkade-in-memory-repo-snapshot'
import { InMemoryContractRepository } from '@arkade-os/sdk'

describe('createPersistingArkadeStorage', () => {
  it('hydrates wallet repo from sdkPersistenceJson without network', async () => {
    const sourceWallet = new InMemoryWalletRepository()
    await sourceWallet.saveWalletState({ settings: { label: 'offline-wallet' } })
    const envelope = exportBitboardArkadeSdkPersistence({
      walletRepository: sourceWallet,
      contractRepository: new InMemoryContractRepository(),
    })
    const sdkPersistenceJson = stringifyBitboardArkadeSdkPersistence(envelope)

    const { innerWalletRepository } = createPersistingArkadeStorage(sdkPersistenceJson)
    const state = await innerWalletRepository.getWalletState()

    expect(state).toEqual({ settings: { label: 'offline-wallet' } })
  })
})
