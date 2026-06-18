import { describe, expect, it } from 'vitest'
import {
  assertSdkPersistenceJsonWithinSizeLimit,
  mergeSdkPersistenceJsonMonotonic,
  mergeSdkPersistenceIntoPayload,
  readOffchainNextDerivationIndex,
  updateOperatorSyncAtInPayload,
} from '@/lib/arkade/arkade-payload-merge'
import { ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES } from '@/lib/arkade/arkade-sdk-persistence-types'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

function persistenceJsonWithReceiveIndex(index: number): string {
  return JSON.stringify({
    version: 3,
    wallet_db: { offchain_next_derivation_index: index },
  })
}

function basePayload(): WalletSecretsPayload {
  return {
    descriptorWallets: [],
    lightningNwcConnections: [],
    arkadeOperatorConnections: [
      {
        id: 'conn-1',
        label: 'Mutinynet',
        networkMode: 'signet',
        operatorUrl: 'https://signet.arkade.example/v1',
        operatorSignerPkHex: '02abc',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    activeArkadeConnectionIdByNetwork: { signet: 'conn-1' },
  }
}

describe('arkade-payload-merge', () => {
  it('rejects persistence JSON over size limit', () => {
    const oversized = 'x'.repeat(ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES + 1)
    expect(() => assertSdkPersistenceJsonWithinSizeLimit(oversized)).toThrow(/exceeds/)
  })

  it('readOffchainNextDerivationIndex reads wallet_db scalar', () => {
    expect(readOffchainNextDerivationIndex(persistenceJsonWithReceiveIndex(2))).toBe(2)
    expect(readOffchainNextDerivationIndex(undefined)).toBe(0)
  })

  it('mergeSdkPersistenceJsonMonotonic keeps the higher receive cursor', () => {
    const indexOne = persistenceJsonWithReceiveIndex(1)
    const indexTwo = persistenceJsonWithReceiveIndex(2)

    expect(mergeSdkPersistenceJsonMonotonic(indexOne, indexTwo)).toBe(indexTwo)
    expect(mergeSdkPersistenceJsonMonotonic(indexTwo, indexOne)).toBe(indexTwo)
  })

  it('mergeSdkPersistenceIntoPayload updates connection sdk blob', () => {
    const sdkPersistenceJson = JSON.stringify({ version: 3, wallet_db: {} })
    const merged = mergeSdkPersistenceIntoPayload(
      basePayload(),
      'conn-1',
      sdkPersistenceJson,
      '2020-01-02T00:00:00.000Z',
    )

    expect(merged.arkadeOperatorConnections[0].sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(merged.arkadeOperatorConnections[0].lastSuccessfulOperatorSyncAt).toBe(
      '2020-01-02T00:00:00.000Z',
    )
  })

  it('mergeSdkPersistenceIntoPayload keeps higher receive cursor on concurrent writes', () => {
    const existingJson = persistenceJsonWithReceiveIndex(2)
    const staleIncomingJson = persistenceJsonWithReceiveIndex(1)
    const payload: WalletSecretsPayload = {
      ...basePayload(),
      arkadeOperatorConnections: [
        {
          ...basePayload().arkadeOperatorConnections[0],
          sdkPersistenceJson: existingJson,
        },
      ],
    }

    const merged = mergeSdkPersistenceIntoPayload(payload, 'conn-1', staleIncomingJson)

    expect(merged.arkadeOperatorConnections[0].sdkPersistenceJson).toBe(existingJson)
  })

  it('updateOperatorSyncAtInPayload updates sync timestamp only', () => {
    const existingJson = persistenceJsonWithReceiveIndex(2)
    const payload: WalletSecretsPayload = {
      ...basePayload(),
      arkadeOperatorConnections: [
        {
          ...basePayload().arkadeOperatorConnections[0],
          sdkPersistenceJson: existingJson,
          lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
        },
      ],
    }

    const merged = updateOperatorSyncAtInPayload(
      payload,
      'conn-1',
      '2020-01-03T00:00:00.000Z',
    )

    expect(merged.arkadeOperatorConnections[0].sdkPersistenceJson).toBe(existingJson)
    expect(merged.arkadeOperatorConnections[0].lastSuccessfulOperatorSyncAt).toBe(
      '2020-01-03T00:00:00.000Z',
    )
  })
})
