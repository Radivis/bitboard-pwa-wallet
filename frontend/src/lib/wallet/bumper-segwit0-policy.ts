import { AddressType } from '@/lib/wallet/wallet-domain-types'

export const BUMPER_ADDRESS_TYPE = AddressType.SegWit
export const BUMPER_ACCOUNT_ID = 0

export type BumperHydrateSource = 'live-export' | 'persisted-row' | 'empty'

export function isLoadedSegwit0Triple(loaded: {
  addressType: AddressType | string | null
  accountId: number | null
} | null): boolean {
  return (
    loaded?.addressType === BUMPER_ADDRESS_TYPE &&
    loaded.accountId === BUMPER_ACCOUNT_ID
  )
}

export function persistedChangesetIsUsable(
  changesetJson: string | undefined | null,
): boolean {
  if (changesetJson == null) {
    return false
  }
  const trimmed = changesetJson.trim()
  if (trimmed === '') {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return (
      parsed != null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed as object).length > 0
    )
  } catch {
    return false
  }
}

export function bumperFullScanDoneForHydrate(input: {
  source: BumperHydrateSource
  rowFullScanDone: boolean
}): boolean {
  if (input.source === 'empty') {
    return false
  }
  return input.rowFullScanDone
}

export function bumperHydrateSource(input: {
  loadedIsSegwit0: boolean
  persistedChangesetUsable: boolean
}): BumperHydrateSource {
  if (input.loadedIsSegwit0) {
    return 'live-export'
  }
  if (input.persistedChangesetUsable) {
    return 'persisted-row'
  }
  return 'empty'
}

export function shouldPersistBumperSegwit0Sidecar(input: {
  loadedAddressType: AddressType | string | null
  loadedAccountId: number | null
}): boolean {
  return !isLoadedSegwit0Triple({
    addressType: input.loadedAddressType,
    accountId: input.loadedAccountId,
  })
}
