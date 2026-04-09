import { describe, expect, it } from 'vitest'
import {
  assertLabAddressOwnerResolved,
  groupLabRowsByResolvedOwner,
  lookupLabAddressOwner,
  mergeAddressesWithUtxos,
  resolveLabAddressOwnerDisplay,
  sortLabOwnerKeys,
} from '@/lib/lab-utils'
import type { LabTxDetails, LabTxRecord } from '@/workers/lab-api'

describe('lookupLabAddressOwner', () => {
  it('finds owner when bech32 casing differs from map key', () => {
    const map = { bcrt1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: 'Alice' }
    expect(lookupLabAddressOwner('BCRT1QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', map)).toBe(
      'Alice',
    )
  })

  it('returns undefined when no match', () => {
    expect(lookupLabAddressOwner('bcrt1qunknown', {})).toBeUndefined()
  })
})

describe('resolveLabAddressOwnerDisplay', () => {
  it('falls back to tx output owner when map key casing mismatches utxo address', () => {
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
            owner: 'Charlie',
          },
        ],
      },
    ]
    const map: Record<string, string> = {}
    expect(
      resolveLabAddressOwnerDisplay('bcrt1pchange', map, txDetails),
    ).toBe('Charlie')
  })

  it('prefers map over tx details when both exist', () => {
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
            owner: 'Wrong',
          },
        ],
      },
    ]
    expect(
      resolveLabAddressOwnerDisplay('bcrt1paaa', { bcrt1paaa: 'Right' }, txDetails),
    ).toBe('Right')
  })

  it('infers payee from LabTxRecord when output.owner is missing', () => {
    const txDetails: LabTxDetails[] = [
      {
        txid: 'abc',
        blockHeight: 1,
        blockTime: 0,
        confirmations: 1,
        isCoinbase: false,
        inputs: [],
        outputs: [
          {
            address: 'bcrt1ppay',
            amountSats: 100,
            isChange: false,
          },
        ],
      },
    ]
    const transactions: LabTxRecord[] = [
      { txid: 'abc', sender: 'Alice', receiver: 'Bob' },
    ]
    expect(
      resolveLabAddressOwnerDisplay('bcrt1ppay', {}, txDetails, transactions),
    ).toBe('Bob')
  })

  it('infers change owner from sender when output.owner is missing', () => {
    const txDetails: LabTxDetails[] = [
      {
        txid: 'abc',
        blockHeight: 1,
        blockTime: 0,
        confirmations: 1,
        isCoinbase: false,
        inputs: [],
        outputs: [
          {
            address: 'bcrt1pch',
            amountSats: 50,
            isChange: true,
          },
        ],
      },
    ]
    const transactions: LabTxRecord[] = [
      { txid: 'abc', sender: 'Alice', receiver: 'Bob' },
    ]
    expect(
      resolveLabAddressOwnerDisplay('bcrt1pch', {}, txDetails, transactions),
    ).toBe('Alice')
  })
})

describe('assertLabAddressOwnerResolved', () => {
  it('throws when owner is undefined', () => {
    expect(() =>
      assertLabAddressOwnerResolved('bcrt1ptest', undefined, 'test'),
    ).toThrow(/Lab address has no resolved owner \(test\)/)
  })

  it('throws when owner is empty string', () => {
    expect(() => assertLabAddressOwnerResolved('bcrt1ptest', '')).toThrow(
      /Lab address has no resolved owner/,
    )
  })

  it('does not throw when owner is set', () => {
    expect(() => assertLabAddressOwnerResolved('bcrt1ptest', 'Alice')).not.toThrow()
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
      (addr) => (addr === 'a1' || addr === 'a2' ? 'Alice' : 'Bob'),
      'test',
    )
    expect(sortedOwnerKeys).toEqual(['Alice', 'Bob'])
    expect(byOwner.get('Alice')?.map((r) => r.id)).toEqual([1, 2])
    expect(byOwner.get('Bob')?.map((r) => r.id)).toEqual([3])
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
