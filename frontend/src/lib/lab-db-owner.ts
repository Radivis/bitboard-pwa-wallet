import type { LabOwner } from '@/lib/lab-owner'
import { labOwnerFromSortKey, labOwnerFromWalletOwnerKey } from '@/lib/lab-owner'

export function labOwnerFromDbPair(
  labEntityId: number | null | undefined,
  walletId: number | null | undefined,
): LabOwner | null {
  if (labEntityId != null && labEntityId > 0) {
    return { kind: 'lab_entity', labEntityId }
  }
  if (walletId != null && walletId > 0) {
    return { kind: 'wallet', walletId }
  }
  return null
}

export function labOwnerToDbPair(
  owner: LabOwner | null,
): { labEntityId: number | null; walletId: number | null } {
  if (owner == null) return { labEntityId: null, walletId: null }
  if (owner.kind === 'lab_entity') return { labEntityId: owner.labEntityId, walletId: null }
  return { labEntityId: null, walletId: owner.walletId }
}

/**
 * Prefer id columns; fall back to a legacy display key string (e.g. `lab_mine_operations.mined_by_key`,
 * `lab_tx_operations.sender_key`) when ids are absent.
 */
export function labOwnerFromTxRow(
  labEntityId: number | null | undefined,
  walletId: number | null | undefined,
  legacy: string | null,
  _entities: readonly { labEntityId: number; entityName: string | null }[],
): LabOwner | null {
  const fromIds = labOwnerFromDbPair(labEntityId, walletId)
  if (fromIds) return fromIds
  if (legacy != null && legacy !== '') {
    return labOwnerFromSortKey(legacy) ?? labOwnerFromWalletOwnerKey(legacy)
  }
  return null
}
