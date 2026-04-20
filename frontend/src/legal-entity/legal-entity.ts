import entityJson from './entity.json'

/** Postal address components — single structured source for imprint and privacy. */
export type LegalEntityAddress = {
  /** Optional care-of or postbox service line. */
  careOf?: string
  /** Street and house number. */
  street: string
  /** Postal or ZIP code. */
  postalCode: string
  /** City or municipality. */
  locality: string
  /** Country — optional when obvious from context (e.g. domestic-only imprint). */
  country?: string
}

/** Jurisdiction / operator facts — single source of truth, not duplicated per UI locale. */
export type LegalEntity = {
  name: string
  address: LegalEntityAddress
  email: string
}

export const legalEntity: LegalEntity = entityJson as LegalEntity

export function hasLegalEntityAddressData(a: LegalEntityAddress): boolean {
  return [
    a.careOf,
    a.street,
    a.postalCode,
    a.locality,
    a.country,
  ].some((s) => s != null && String(s).trim().length > 0)
}

/** Non-empty lines in display order (care-of, street, postal + locality, country). */
export function legalEntityAddressLines(a: LegalEntityAddress): string[] {
  const lines: string[] = []
  const careOf = a.careOf?.trim()
  if (careOf) lines.push(careOf)
  const street = a.street.trim()
  if (street) lines.push(street)
  const pc = a.postalCode.trim()
  const loc = a.locality.trim()
  const cityLine = [pc, loc].filter(Boolean).join(' ')
  if (cityLine) lines.push(cityLine)
  const country = a.country?.trim()
  if (country) lines.push(country)
  return lines
}

export function hasLegalEntityData(e: LegalEntity): boolean {
  return (
    e.name.trim().length > 0 ||
    e.email.trim().length > 0 ||
    hasLegalEntityAddressData(e.address)
  )
}
