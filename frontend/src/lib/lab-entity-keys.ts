import { AddressType } from '@/lib/wallet-domain-types'

/**
 * Lab entity stable string keys for `addressToOwner`, mempool, and UI.
 * Anonymous entities store `entityName: null` and use `Anonymous-{labEntityId}` as the key.
 */

/** Plain-text option label for mining target select (no React in `<option>`). */
export function formatLabEntityMineOptionLabel(e: {
  labEntityId: number
  entityName: string | null
  addressType: AddressType
}): string {
  const name = labEntityOwnerKey(e)
  const suffix = e.addressType === AddressType.Taproot ? 'Taproot' : 'SegWit'
  return `${name} · ${suffix}`
}

export function labEntityOwnerKey(e: { labEntityId: number; entityName: string | null }): string {
  return e.entityName ?? `Anonymous-${e.labEntityId}`
}

export function nextLabEntityId(
  entities: readonly { labEntityId: number }[],
): number {
  let max = 0
  for (const e of entities) {
    if (e.labEntityId > max) max = e.labEntityId
  }
  return max + 1
}

export function findLabEntityByOwnerKey<
  T extends { labEntityId: number; entityName: string | null },
>(entities: readonly T[], ownerKey: string): T | undefined {
  return entities.find((e) => labEntityOwnerKey(e) === ownerKey)
}

export function findLabEntityById<
  T extends { labEntityId: number },
>(entities: readonly T[], labEntityId: number): T | undefined {
  return entities.find((e) => e.labEntityId === labEntityId)
}
