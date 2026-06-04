import { describe, expect, it } from 'vitest'
import { InMemoryContractRepository, InMemoryWalletRepository } from '@arkade-os/sdk'
import { BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION } from '@/lib/arkade/arkade-sdk-persistence-types'
import {
  exportBitboardArkadeSdkPersistence,
  importBitboardArkadeSdkPersistence,
  parseBitboardArkadeSdkPersistenceJson,
  stringifyBitboardArkadeSdkPersistence,
} from '@/lib/arkade/storage/arkade-in-memory-repo-snapshot'

describe('arkade-in-memory-repo-snapshot', () => {
  it('round-trips wallet state through persistence envelope', async () => {
    const sourceWallet = new InMemoryWalletRepository()
    await sourceWallet.saveWalletState({ settings: { theme: 'dark' } })

    const sourceContract = new InMemoryContractRepository()
    const envelope = exportBitboardArkadeSdkPersistence({
      walletRepository: sourceWallet,
      contractRepository: sourceContract,
    })
    expect(envelope.version).toBe(BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION)

    const targetWallet = new InMemoryWalletRepository()
    const targetContract = new InMemoryContractRepository()
    importBitboardArkadeSdkPersistence({
      walletRepository: targetWallet,
      contractRepository: targetContract,
      persistence: envelope,
    })

    const state = await targetWallet.getWalletState()
    expect(state).toEqual({ settings: { theme: 'dark' } })
  })

  it('parses stringified persistence JSON', () => {
    const wallet = new InMemoryWalletRepository()
    const contract = new InMemoryContractRepository()
    const envelope = exportBitboardArkadeSdkPersistence({
      walletRepository: wallet,
      contractRepository: contract,
    })
    const json = stringifyBitboardArkadeSdkPersistence(envelope)
    const parsed = parseBitboardArkadeSdkPersistenceJson(json)
    expect(parsed.version).toBe(BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION)
  })
})
