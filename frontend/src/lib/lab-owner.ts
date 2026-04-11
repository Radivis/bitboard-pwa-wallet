/**
 * Canonical ownership in the lab simulator: wallet (real app wallet) vs lab entity (simulated).
 * Use stable IDs — never use entity_name or "Anonymous-*" strings as identity.
 */
import { labEntityOwnerKey } from '@/lib/lab-entity-keys'
import { WALLET_OWNER_PREFIX } from '@/lib/lab-utils'

export type LabOwner =
  | { kind: 'wallet'; walletId: number }
  | { kind: 'lab_entity'; labEntityId: number }

export function walletLabOwner(walletId: number): LabOwner {
  return { kind: 'wallet', walletId }
}

export function labEntityLabOwner(labEntityId: number): LabOwner {
  return { kind: 'lab_entity', labEntityId }
}

export function labOwnersEqual(
  a: LabOwner | null | undefined,
  b: LabOwner | null | undefined,
): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (a.kind !== b.kind) return false
  return a.kind === 'wallet'
    ? a.walletId === (b as { kind: 'wallet'; walletId: number }).walletId
    : a.labEntityId === (b as { kind: 'lab_entity'; labEntityId: number }).labEntityId
}

/** Stable string for sorting / query keys (not a display label). */
export function labOwnerSortKey(owner: LabOwner): string {
  return owner.kind === 'wallet' ? `w:${owner.walletId}` : `e:${owner.labEntityId}`
}

/** Inverse of {@link labOwnerSortKey} for map keys used in grouped UI lists. */
export function labOwnerFromSortKey(key: string): LabOwner | null {
  const w = /^w:(\d+)$/.exec(key)
  if (w) {
    const walletId = parseInt(w[1], 10)
    if (!Number.isNaN(walletId)) return { kind: 'wallet', walletId }
  }
  const e = /^e:(\d+)$/.exec(key)
  if (e) {
    const labEntityId = parseInt(e[1], 10)
    if (!Number.isNaN(labEntityId)) return { kind: 'lab_entity', labEntityId }
  }
  return null
}

/** Legacy `wallet:{id}` string → LabOwner. */
export function labOwnerFromWalletOwnerKey(key: string): LabOwner | null {
  if (!key.startsWith(WALLET_OWNER_PREFIX)) return null
  const id = parseInt(key.slice(WALLET_OWNER_PREFIX.length), 10)
  if (Number.isNaN(id)) return null
  return { kind: 'wallet', walletId: id }
}

/**
 * Resolves a legacy owner string (wallet:…, entity display key, or Anonymous-n) to LabOwner
 * using the current entity list.
 */
export function labOwnerFromLegacyKey(
  key: string,
  entities: readonly { labEntityId: number; entityName: string | null }[],
): LabOwner | null {
  const w = labOwnerFromWalletOwnerKey(key)
  if (w) return w
  const anon = /^Anonymous-(\d+)$/.exec(key.trim())
  if (anon) {
    const labEntityId = parseInt(anon[1], 10)
    if (!Number.isNaN(labEntityId)) return { kind: 'lab_entity', labEntityId }
  }
  for (const e of entities) {
    if (labEntityOwnerKey(e) === key) return { kind: 'lab_entity', labEntityId: e.labEntityId }
  }
  return null
}

/** Normalize owner stored in JSON (string legacy vs object). */
export function normalizeJsonOwnerToLabOwner(
  raw: unknown,
  entities: readonly { labEntityId: number; entityName: string | null }[],
): LabOwner | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (o.kind === 'wallet' && typeof o.walletId === 'number') {
      return { kind: 'wallet', walletId: o.walletId }
    }
    if (o.kind === 'lab_entity' && typeof o.labEntityId === 'number') {
      return { kind: 'lab_entity', labEntityId: o.labEntityId }
    }
  }
  if (typeof raw === 'string') return labOwnerFromLegacyKey(raw, entities)
  return null
}

export function labOwnerDisplayKey(
  owner: LabOwner,
  entities: readonly { labEntityId: number; entityName: string | null }[],
): string {
  if (owner.kind === 'wallet') return `${WALLET_OWNER_PREFIX}${owner.walletId}`
  const e = entities.find((x) => x.labEntityId === owner.labEntityId)
  return e ? labEntityOwnerKey(e) : `Anonymous-${owner.labEntityId}`
}

/**
 * Returns the entity row for a lab-entity owner, or undefined if not a lab entity or missing.
 */
export function labEntityRecordForLabOwner<
  T extends { labEntityId: number },
>(owner: LabOwner, entities: readonly T[]): T | undefined {
  if (owner.kind !== 'lab_entity') return undefined
  return entities.find((e) => e.labEntityId === owner.labEntityId)
}

/** Maximum length for a lab entity display name (create / rename). */
export const LAB_ENTITY_NAME_MAX_LENGTH = 128

/**
 * Ensures the lab worker does not build spends from a dead entity (defense in depth vs UI).
 */
export function labEntityMustBeAliveToSend(entity: { isDead: boolean }): void {
  if (entity.isDead) {
    throw new Error('Dead lab entities cannot send transactions.')
  }
}

export function labOwnerDisplayName(
  owner: LabOwner,
  wallets: { wallet_id: number; name: string }[],
  entities: readonly { labEntityId: number; entityName: string | null }[],
): string {
  if (owner.kind === 'wallet') {
    return wallets.find((w) => w.wallet_id === owner.walletId)?.name ?? 'Unknown wallet'
  }
  const e = entities.find((x) => x.labEntityId === owner.labEntityId)
  return e ? labEntityOwnerKey(e) : `Anonymous-${owner.labEntityId}`
}

/** Validates rename target: non-empty, unique among entity names, not starting with Anonymous-. */
export function validateLabEntityRenameName(
  trimmed: string,
  entities: readonly { labEntityId: number; entityName: string | null }[],
  excludeLabEntityId: number,
): { ok: true } | { ok: false; error: string } {
  if (trimmed.length === 0) return { ok: false, error: 'Name must not be empty' }
  if (trimmed.length > LAB_ENTITY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Name must be at most ${LAB_ENTITY_NAME_MAX_LENGTH} characters`,
    }
  }
  if (trimmed.startsWith('Anonymous-')) {
    return { ok: false, error: 'Name must not start with "Anonymous-"' }
  }
  const taken = entities.some(
    (e) =>
      e.labEntityId !== excludeLabEntityId &&
      e.entityName != null &&
      e.entityName === trimmed,
  )
  if (taken) return { ok: false, error: 'That name is already taken' }
  return { ok: true }
}

/**
 * True when an owner group key (sort key, legacy string, etc.) refers to a lab entity with `isDead`.
 */
export function isLabEntityOwnerGroupDead(
  ownerKey: string,
  entities: readonly { labEntityId: number; entityName: string | null; isDead: boolean }[],
): boolean {
  const owner =
    labOwnerFromSortKey(ownerKey) ?? labOwnerFromLegacyKey(ownerKey, entities)
  if (owner?.kind !== 'lab_entity') return false
  return entities.find((e) => e.labEntityId === owner.labEntityId)?.isDead === true
}
