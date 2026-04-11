import { labEntityRecordForLabOwner, type LabOwner } from '@/lib/lab-owner'
import {
  getOwnerDisplayName,
  resolveLabOwnerForDisplay,
} from '@/lib/lab-utils'
import { LabAddressTypeBadge } from '@/components/lab/LabAddressTypeBadge'

type EntityWithAddressType = {
  labEntityId: number
  entityName: string | null
  addressType: string
}

export function LabOwnerDisplayWithAddressType({
  owner,
  wallets,
  entities,
}: {
  owner: LabOwner | string
  wallets: { wallet_id: number; name: string }[]
  entities: readonly EntityWithAddressType[]
}) {
  const displayName = getOwnerDisplayName(owner, wallets, entities)
  const resolved = resolveLabOwnerForDisplay(owner, wallets, entities)
  const entity =
    resolved?.kind === 'lab_entity'
      ? labEntityRecordForLabOwner(resolved, entities)
      : undefined

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{displayName}</span>
      {entity != null ? <LabAddressTypeBadge addressType={entity.addressType} /> : null}
    </span>
  )
}
