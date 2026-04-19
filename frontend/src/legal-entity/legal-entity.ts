import entityJson from './entity.json'

/** Jurisdiction / operator facts — single source of truth, not duplicated per UI locale. */
export type LegalEntity = {
  name: string
  address: string
  email: string
}

export const legalEntity: LegalEntity = entityJson as LegalEntity

export function hasLegalEntityData(e: LegalEntity): boolean {
  return [e.name, e.address, e.email].some((s) => s.trim().length > 0)
}
