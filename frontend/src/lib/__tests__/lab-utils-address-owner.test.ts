import { describe, expect, it } from 'vitest'
import {
  assertLabAddressOwnerResolved,
  groupLabRowsByResolvedOwner,
  lookupLabAddressOwner,
  mergeAddressesWithUtxos,
  resolveDeadLabEntityRecipient,
  resolveLabAddressOwnerDisplay,
  sortLabOwnerKeys,
} from '@/lib/lab-utils'
import type { LabOwner } from '@/lib/lab-owner'
import { labEntityLabOwner } from '@/lib/lab-owner'
import type { LabEntityRecord, LabTxDetails } from '@/workers/lab-api'

function minimalEntity(
  overrides: Partial<LabEntityRecord> & Pick<LabEntityRecord, 'labEntityId' | 'isDead'>,
): LabEntityRecord {
  return {
    entityName: null,
    mnemonic: '',
    changesetJson: '',
    externalDescriptor: '',
    internalDescriptor: '',
    network: 'regtest',
    addressType: 'segwit',
    accountId: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const emptyWallets: { wallet_id: number; name: string }[] = []

describe('lookupLabAddressOwner', () => {
  it('finds owner when bech32 casing differs from map key', () => {
    const owner = labEntityLabOwner(1)
    const map = { bcrt1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: owner }
    expect(lookupLabAddressOwner('BCRT1QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', map)).toEqual(
      owner,
    )
  })

  it('returns undefined when no match', () => {
    expect(lookupLabAddressOwner('bcrt1qunknown', {})).toBeUndefined()
  })
})

describe('resolveLabAddressOwnerDisplay', () => {
  it('falls back to tx output owner when map key casing mismatches utxo address', () => {
    const entities = [{ labEntityId: 1, entityName: 'Charlie' as string | null }]
    const txDetails: LabTxDetails[] = [
      {
        txid: 'abc',
        blockHeight: 1,
        blockTime: 0,
        confirmations: 1,
        inputs: [],
        outputs: [
          {
            address: 'bcrt1pCHANGE',
            amountSats: 1000,
            isChange: true,
            owner: labEntityLabOwner(1),
          },
        ],
      },
    ]
    const map: Record<string, LabOwner> = {}
    expect(
      resolveLabAddressOwnerDisplay('bcrt1pchange', map, txDetails, entities, emptyWallets),
    ).toBe('Charlie')
  })

  it('prefers map over tx details when both exist', () => {
    const entities = [
      { labEntityId: 2, entityName: 'Right' as string | null },
      { labEntityId: 3, entityName: 'Wrong' as string | null },
    ]
    const txDetails: LabTxDetails[] = [
      {
        txid: 'abc',
        blockHeight: 1,
        blockTime: 0,
        confirmations: 1,
        inputs: [],
        outputs: [
          {
            address: 'bcrt1paaa',
            amountSats: 1,
            owner: labEntityLabOwner(3),
          },
        ],
      },
    ]
    expect(
      resolveLabAddressOwnerDisplay(
        'bcrt1paaa',
        { bcrt1paaa: labEntityLabOwner(2) },
        txDetails,
        entities,
        emptyWallets,
      ),
    ).toBe('Right')
  })
})

describe('assertLabAddressOwnerResolved', () => {
  it('throws when owner is undefined', () => {
    expect(() =>
      assertLabAddressOwnerResolved('bcrt1ptest', undefined, 'test'),
    ).toThrow(/Lab address has no resolved owner \(test\)/)
  })

  it('does not throw when owner is set', () => {
    expect(() => assertLabAddressOwnerResolved('bcrt1ptest', labEntityLabOwner(1))).not.toThrow()
  })
})

describe('sortLabOwnerKeys', () => {
  it('sorts keys lexicographically', () => {
    expect(sortLabOwnerKeys(['Zed', 'Alice', 'Bob'])).toEqual(['Alice', 'Bob', 'Zed'])
  })
})

describe('groupLabRowsByResolvedOwner', () => {
  it('groups by owner key and sorts keys', () => {
    const { byOwner, sortedOwnerKeys } = groupLabRowsByResolvedOwner(
      [
        { id: 1, addr: 'a1' },
        { id: 2, addr: 'a2' },
        { id: 3, addr: 'a3' },
      ],
      (row) => row.addr,
      (addr) =>
        addr === 'a1' || addr === 'a2' ? labEntityLabOwner(1) : labEntityLabOwner(2),
      'test',
    )
    expect(sortedOwnerKeys).toEqual(['lab-entity:1', 'lab-entity:2'])
    expect(byOwner.get('lab-entity:1')?.map((r) => r.id)).toEqual([1, 2])
    expect(byOwner.get('lab-entity:2')?.map((r) => r.id)).toEqual([3])
  })
})

describe('mergeAddressesWithUtxos', () => {
  it('does not duplicate the same bech32 address with different casing', () => {
    const merged = mergeAddressesWithUtxos(
      [{ address: 'bcrt1pAAA', wif: '' }],
      [{ txid: 't', vout: 0, address: 'bcrt1paaa', amountSats: 1, scriptPubkeyHex: '' }],
    )
    expect(merged).toHaveLength(1)
  })
})

describe('resolveDeadLabEntityRecipient', () => {
  it('returns null when address is not a dead lab entity', () => {
    const addr = 'bcrt1qdeadtest'
    const map: Record<string, LabOwner> = { [addr]: labEntityLabOwner(1) }
    const entities = [minimalEntity({ labEntityId: 1, isDead: false, entityName: 'Alive' })]
    expect(resolveDeadLabEntityRecipient(addr, map, entities)).toBeNull()
  })

  it('returns display name when address maps to a dead lab entity', () => {
    const addr = 'bcrt1qdeadtest'
    const map: Record<string, LabOwner> = { [addr]: labEntityLabOwner(2) }
    const entities = [minimalEntity({ labEntityId: 2, isDead: true, entityName: 'Gone' })]
    expect(resolveDeadLabEntityRecipient(addr, map, entities)).toEqual({
      displayName: 'Gone',
      addressType: 'segwit',
    })
  })

  it('returns null for wallet-owned address', () => {
    const addr = 'bcrt1qwallet'
    const map: Record<string, LabOwner> = {
      [addr]: { kind: 'wallet', walletId: 1 },
    }
    const entities = [minimalEntity({ labEntityId: 1, isDead: true })]
    expect(resolveDeadLabEntityRecipient(addr, map, entities)).toBeNull()
  })
})
