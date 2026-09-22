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

function parseIsoTimestampMs(value: string | undefined): number | null {
  if (value == null || value.trim() === '') {
    return null
  }
  const parsedMs = Date.parse(value)
  return Number.isFinite(parsedMs) ? parsedMs : null
}

function changesetJsonForCompare(changesetJson: string | undefined | null): string | null {
  if (changesetJson == null || !persistedChangesetIsUsable(changesetJson)) {
    return null
  }
  return changesetJson.trim()
}

/** SE-03: persist a sidecar export only when it is strictly newer than the row. */
export function bumperSidecarExportIsNewerThanRow(input: {
  exportSyncedAt: string | undefined
  exportChangesetJson: string
  rowLastSuccessfulEsploraSyncAt?: string
  rowChangesetJson?: string | null
}): boolean {
  const exportChangeset = changesetJsonForCompare(input.exportChangesetJson)
  if (exportChangeset == null) {
    return false
  }
  const rowChangeset = changesetJsonForCompare(input.rowChangesetJson)
  if (rowChangeset == null) {
    return true
  }
  if (exportChangeset === rowChangeset) {
    return false
  }
  const exportSyncedAtMs = parseIsoTimestampMs(input.exportSyncedAt)
  if (exportSyncedAtMs == null) {
    return false
  }
  const rowSyncedAtMs = parseIsoTimestampMs(input.rowLastSuccessfulEsploraSyncAt)
  if (rowSyncedAtMs == null) {
    return true
  }
  return exportSyncedAtMs > rowSyncedAtMs
}
