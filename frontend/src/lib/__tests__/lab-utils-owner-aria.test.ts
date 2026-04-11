import { describe, expect, it } from 'vitest'
import { getOwnerDisplayNameWithAddressTypeAria } from '@/lib/lab-utils'
import { labEntityLabOwner } from '@/lib/lab-owner'

describe('getOwnerDisplayNameWithAddressTypeAria', () => {
  const wallets = [{ wallet_id: 1, name: 'Main' }]
  const entitiesSegwit = [
    { labEntityId: 1, entityName: 'Bob' as string | null, addressType: 'segwit' },
  ]
  const entitiesTaproot = [
    { labEntityId: 2, entityName: null as string | null, addressType: 'taproot' },
  ]

  it('appends SegWit for segwit lab entity', () => {
    expect(
      getOwnerDisplayNameWithAddressTypeAria(labEntityLabOwner(1), wallets, entitiesSegwit),
    ).toBe('Bob, SegWit')
  })

  it('appends Taproot experimental for taproot anonymous entity', () => {
    expect(
      getOwnerDisplayNameWithAddressTypeAria(labEntityLabOwner(2), wallets, entitiesTaproot),
    ).toBe('Anonymous-2, Taproot experimental')
  })

  it('does not append for wallet owner', () => {
    expect(
      getOwnerDisplayNameWithAddressTypeAria(
        { kind: 'wallet', walletId: 1 },
        wallets,
        entitiesSegwit,
      ),
    ).toBe('Main')
  })
})
