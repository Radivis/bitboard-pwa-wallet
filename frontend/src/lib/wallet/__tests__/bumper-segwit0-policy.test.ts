import { describe, expect, it } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'
import {
  BUMPER_ACCOUNT_ID,
  BUMPER_ADDRESS_TYPE,
  bumperFullScanDoneForHydrate,
  bumperHydrateSource,
  bumperSidecarExportIsNewerThanRow,
  isLoadedSegwit0Triple,
  persistedChangesetIsUsable,
  shouldPersistBumperSegwit0Sidecar,
} from '@/lib/wallet/bumper-segwit0-policy'

describe('LIFE-ARK-BUMP-02 bumperHydrateSource', () => {
  it('prefers live export, then persisted row, else empty', () => {
    expect(
      bumperHydrateSource({
        loadedIsSegwit0: true,
        persistedChangesetUsable: true,
      }),
    ).toBe('live-export')
    expect(
      bumperHydrateSource({
        loadedIsSegwit0: true,
        persistedChangesetUsable: false,
      }),
    ).toBe('live-export')
    expect(
      bumperHydrateSource({
        loadedIsSegwit0: false,
        persistedChangesetUsable: true,
      }),
    ).toBe('persisted-row')
    expect(
      bumperHydrateSource({
        loadedIsSegwit0: false,
        persistedChangesetUsable: false,
      }),
    ).toBe('empty')
  })

  it('treats non-empty changeset JSON as usable', () => {
    expect(persistedChangesetIsUsable(undefined)).toBe(false)
    expect(persistedChangesetIsUsable('')).toBe(false)
    expect(persistedChangesetIsUsable('{}')).toBe(false)
    expect(persistedChangesetIsUsable('not-json')).toBe(false)
    expect(persistedChangesetIsUsable('{"local":{}}')).toBe(true)
  })

  it('detects loaded SegWit-0', () => {
    expect(
      isLoadedSegwit0Triple({
        addressType: BUMPER_ADDRESS_TYPE,
        accountId: BUMPER_ACCOUNT_ID,
      }),
    ).toBe(true)
    expect(
      isLoadedSegwit0Triple({ addressType: AddressType.Taproot, accountId: 0 }),
    ).toBe(false)
  })
})

describe('CQ-02 bumperFullScanDoneForHydrate', () => {
  it('empty is false even when row flag is true', () => {
    expect(
      bumperFullScanDoneForHydrate({
        source: 'empty',
        rowFullScanDone: true,
      }),
    ).toBe(false)
  })

  it('uses row flag for live-export and persisted-row', () => {
    expect(
      bumperFullScanDoneForHydrate({
        source: 'live-export',
        rowFullScanDone: false,
      }),
    ).toBe(false)
    expect(
      bumperFullScanDoneForHydrate({
        source: 'live-export',
        rowFullScanDone: true,
      }),
    ).toBe(true)
    expect(
      bumperFullScanDoneForHydrate({
        source: 'persisted-row',
        rowFullScanDone: true,
      }),
    ).toBe(true)
    expect(
      bumperFullScanDoneForHydrate({
        source: 'persisted-row',
        rowFullScanDone: false,
      }),
    ).toBe(false)
  })
})

describe('LIFE-ARK-BUMP-03 shouldPersistBumperSegwit0Sidecar', () => {
  it('is false only for loaded SegWit-0', () => {
    expect(
      shouldPersistBumperSegwit0Sidecar({
        loadedAddressType: BUMPER_ADDRESS_TYPE,
        loadedAccountId: BUMPER_ACCOUNT_ID,
      }),
    ).toBe(false)
    expect(
      shouldPersistBumperSegwit0Sidecar({
        loadedAddressType: BUMPER_ADDRESS_TYPE,
        loadedAccountId: BUMPER_ACCOUNT_ID,
      }),
    ).toBe(
      !isLoadedSegwit0Triple({
        addressType: BUMPER_ADDRESS_TYPE,
        accountId: BUMPER_ACCOUNT_ID,
      }),
    )
    expect(
      shouldPersistBumperSegwit0Sidecar({
        loadedAddressType: AddressType.Taproot,
        loadedAccountId: 0,
      }),
    ).toBe(true)
    expect(
      shouldPersistBumperSegwit0Sidecar({
        loadedAddressType: AddressType.SegWit,
        loadedAccountId: 1,
      }),
    ).toBe(true)
    expect(
      shouldPersistBumperSegwit0Sidecar({
        loadedAddressType: null,
        loadedAccountId: null,
      }),
    ).toBe(true)
  })
})

describe('SE-03 bumperSidecarExportIsNewerThanRow', () => {
  const newer = '2026-09-22T12:00:00.000Z'
  const older = '2026-09-22T11:00:00.000Z'
  const exportChangeset = '{"local":{"export":true}}'
  const rowChangeset = '{"local":{"row":true}}'

  it('bumperSidecarExportIsNewerThanRow_bootstraps_empty_row', () => {
    expect(
      bumperSidecarExportIsNewerThanRow({
        exportSyncedAt: newer,
        exportChangesetJson: exportChangeset,
        rowLastSuccessfulEsploraSyncAt: newer,
        rowChangesetJson: '',
      }),
    ).toBe(true)
    expect(
      bumperSidecarExportIsNewerThanRow({
        exportSyncedAt: newer,
        exportChangesetJson: exportChangeset,
        rowChangesetJson: undefined,
      }),
    ).toBe(true)
  })

  it('bumperSidecarExportIsNewerThanRow_skips_older_export', () => {
    expect(
      bumperSidecarExportIsNewerThanRow({
        exportSyncedAt: older,
        exportChangesetJson: exportChangeset,
        rowLastSuccessfulEsploraSyncAt: newer,
        rowChangesetJson: rowChangeset,
      }),
    ).toBe(false)
  })

  it('bumperSidecarExportIsNewerThanRow_accepts_newer_export', () => {
    expect(
      bumperSidecarExportIsNewerThanRow({
        exportSyncedAt: newer,
        exportChangesetJson: exportChangeset,
        rowLastSuccessfulEsploraSyncAt: older,
        rowChangesetJson: rowChangeset,
      }),
    ).toBe(true)
  })

  it('bumperSidecarExportIsNewerThanRow_skips_equal_timestamp', () => {
    expect(
      bumperSidecarExportIsNewerThanRow({
        exportSyncedAt: newer,
        exportChangesetJson: exportChangeset,
        rowLastSuccessfulEsploraSyncAt: newer,
        rowChangesetJson: rowChangeset,
      }),
    ).toBe(false)
  })

  it('bumperSidecarExportIsNewerThanRow_skips_identical_changeset', () => {
    expect(
      bumperSidecarExportIsNewerThanRow({
        exportSyncedAt: newer,
        exportChangesetJson: exportChangeset,
        rowLastSuccessfulEsploraSyncAt: older,
        rowChangesetJson: `  ${exportChangeset}  `,
      }),
    ).toBe(false)
  })

  it('bumperSidecarExportIsNewerThanRow_skips_invalid_export_timestamp', () => {
    expect(
      bumperSidecarExportIsNewerThanRow({
        exportSyncedAt: 'not-a-timestamp',
        exportChangesetJson: exportChangeset,
        rowLastSuccessfulEsploraSyncAt: older,
        rowChangesetJson: rowChangeset,
      }),
    ).toBe(false)
    expect(
      bumperSidecarExportIsNewerThanRow({
        exportSyncedAt: undefined,
        exportChangesetJson: exportChangeset,
        rowLastSuccessfulEsploraSyncAt: older,
        rowChangesetJson: rowChangeset,
      }),
    ).toBe(false)
  })
})
