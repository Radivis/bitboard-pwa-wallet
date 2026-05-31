import { AddressType } from '@/lib/wallet/wallet-domain-types'

/**
 * Lab entity stable string keys for `addressToOwner`, mempool, and UI.
 * Anonymous entities store `entityName: null` and use `Anonymous-{labEntityId}` as the key.
 */

/**
 * Plain-text option label for mining target select (no React in `<option>`).
 * Address type is appended only when SegWit address options are enabled (Settings → Features).
 */
export function formatLabEntityMineOptionLabel(
  entity: {
    labEntityId: number
    entityName: string | null
    addressType: AddressType
  },
  showAddressTypeSuffix: boolean,
): string {
  const name = labEntityOwnerKey(entity)
  if (!showAddressTypeSuffix) return name
  const suffix = entity.addressType === AddressType.Taproot ? 'Taproot' : 'SegWit'
  return `${name} · ${suffix}`
}

export function labEntityOwnerKey(entity: {
  labEntityId: number
  entityName: string | null
}): string {
  return entity.entityName ?? `Anonymous-${entity.labEntityId}`
}

export function nextLabEntityId(
  entities: readonly { labEntityId: number }[],
): number {
  let max = 0
  for (const entity of entities) {
    if (entity.labEntityId > max) max = entity.labEntityId
  }
  return max + 1
}

export function findLabEntityByOwnerKey<
  T extends { labEntityId: number; entityName: string | null },
>(entities: readonly T[], ownerKey: string): T | undefined {
  return entities.find((entity) => labEntityOwnerKey(entity) === ownerKey)
}

export function findLabEntityById<
  T extends { labEntityId: number },
>(entities: readonly T[], labEntityId: number): T | undefined {
  return entities.find((entity) => entity.labEntityId === labEntityId)
}
