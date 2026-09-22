import { describe, expect, it } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'
import {
  bumperHydrateSource,
  isLoadedSegwit0Triple,
  persistedChangesetIsUsable,
  shouldPersistBumperSegwit0Sidecar,
} from '@/lib/wallet/bumper-segwit0-policy'

describe('LIFE-ARK-BUMP-02 bumperHydrateSource', () => {
  it('prefers live export, then persisted row, else empty', () => {
    expect(
      bumperHydrateSource({
        loadedIsSegwit0: true,
        onchainLoadPhaseLoaded: true,
        persistedChangesetUsable: true,
      }),
    ).toBe('live-export')
    expect(
      bumperHydrateSource({
        loadedIsSegwit0: true,
        onchainLoadPhaseLoaded: false,
        persistedChangesetUsable: true,
      }),
    ).toBe('persisted-row')
    expect(
      bumperHydrateSource({
        loadedIsSegwit0: false,
        onchainLoadPhaseLoaded: true,
        persistedChangesetUsable: true,
      }),
    ).toBe('persisted-row')
    expect(
      bumperHydrateSource({
        loadedIsSegwit0: false,
        onchainLoadPhaseLoaded: false,
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
      isLoadedSegwit0Triple({ addressType: AddressType.SegWit, accountId: 0 }),
    ).toBe(true)
    expect(
      isLoadedSegwit0Triple({ addressType: AddressType.Taproot, accountId: 0 }),
    ).toBe(false)
  })
})

describe('LIFE-ARK-BUMP-03 shouldPersistBumperSegwit0Sidecar', () => {
  it('is false only for loaded SegWit-0', () => {
    expect(
      shouldPersistBumperSegwit0Sidecar({
        loadedAddressType: AddressType.SegWit,
        loadedAccountId: 0,
      }),
    ).toBe(false)
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
