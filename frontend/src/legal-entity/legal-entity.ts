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

export function hasLegalEntityAddressData(address: LegalEntityAddress): boolean {
  return [
    address.careOf,
    address.street,
    address.postalCode,
    address.locality,
    address.country,
  ].some((fieldValue) => fieldValue != null && String(fieldValue).trim().length > 0)
}

/** Non-empty lines in display order (care-of, street, postal + locality, country). */
export function legalEntityAddressLines(address: LegalEntityAddress): string[] {
  const lines: string[] = []
  const careOf = address.careOf?.trim()
  if (careOf) lines.push(careOf)
  const street = address.street.trim()
  if (street) lines.push(street)
  const postalCode = address.postalCode.trim()
  const locality = address.locality.trim()
  const cityLine = [postalCode, locality].filter(Boolean).join(' ')
  if (cityLine) lines.push(cityLine)
  const country = address.country?.trim()
  if (country) lines.push(country)
  return lines
}

export function hasLegalEntityData(entity: LegalEntity): boolean {
  return (
    entity.name.trim().length > 0 ||
    entity.email.trim().length > 0 ||
    hasLegalEntityAddressData(entity.address)
  )
}
