import { describe, expect, it } from 'vitest'
import {
  labOwnersEqual,
  validateLabEntityRenameName,
  walletLabOwner,
  labEntityLabOwner,
} from '@/lib/lab-owner'

describe('labOwnersEqual', () => {
  it('matches wallet ids', () => {
    expect(labOwnersEqual(walletLabOwner(1), walletLabOwner(1))).toBe(true)
    expect(labOwnersEqual(walletLabOwner(1), walletLabOwner(2))).toBe(false)
  })

  it('matches lab entity ids', () => {
    expect(labOwnersEqual(labEntityLabOwner(3), labEntityLabOwner(3))).toBe(true)
    expect(labOwnersEqual(labEntityLabOwner(3), labEntityLabOwner(4))).toBe(false)
  })

  it('does not match across kinds', () => {
    expect(labOwnersEqual(walletLabOwner(1), labEntityLabOwner(1))).toBe(false)
  })
})

describe('validateLabEntityRenameName', () => {
  const entities = [
    { labEntityId: 1, entityName: 'Alice' as string | null },
    { labEntityId: 2, entityName: 'Bob' as string | null },
  ]

  it('rejects empty name', () => {
    const r = validateLabEntityRenameName('', entities, 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/empty/i)
  })

  it('rejects Anonymous- prefix', () => {
    const r = validateLabEntityRenameName('Anonymous-1', entities, 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Anonymous-/i)
  })

  it('rejects duplicate name', () => {
    const r = validateLabEntityRenameName('Alice', entities, 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/taken/i)
  })

  it('allows same name when renaming the same entity', () => {
    const r = validateLabEntityRenameName('Alice', entities, 1)
    expect(r.ok).toBe(true)
  })

  it('accepts valid unique name', () => {
    const r = validateLabEntityRenameName('Carol', entities, 3)
    expect(r.ok).toBe(true)
  })
})

describe('random tx entity pool (is_dead)', () => {
  it('excludes dead entities from an eligible id list', () => {
    const entities = [
      { labEntityId: 1, isDead: false },
      { labEntityId: 2, isDead: true },
      { labEntityId: 3, isDead: false },
    ]
    const aliveIds = entities.filter((e) => !e.isDead).map((e) => e.labEntityId)
    expect(aliveIds).toEqual([1, 3])
  })
})
