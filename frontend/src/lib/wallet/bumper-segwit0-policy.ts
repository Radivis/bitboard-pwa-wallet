import { AddressType } from '@/lib/wallet/wallet-domain-types'

export type BumperHydrateSource = 'live-export' | 'persisted-row' | 'empty'

export function isLoadedSegwit0Triple(loaded: {
  addressType: AddressType | string | null
  accountId: number | null
} | null): boolean {
  return loaded?.addressType === AddressType.SegWit && loaded.accountId === 0
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
  onchainLoadPhaseLoaded: boolean
  persistedChangesetUsable: boolean
}): BumperHydrateSource {
  if (input.loadedIsSegwit0 && input.onchainLoadPhaseLoaded) {
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
  return !(
    input.loadedAddressType === AddressType.SegWit && input.loadedAccountId === 0
  )
}
