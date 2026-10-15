import { describe, expect, it } from 'vitest'
import {
  applyBarkRecordEnvelope,
  applyClearedExitSeizureNotice,
  applyEmergencyExitFeePreset,
  applyMergedExitSeizureVtxoIds,
  applyEmergencyExitMaxFeeRate,
  applyOpenedBarkAccount,
  applyPendingEmergencyClaim,
  applyProceedAutomatically,
  applySuccessfulBarkSync,
  BarkFingerprintMismatchError,
  findBarkAccount,
  requireBarkAccount,
  signetRecordEnvelopeForOpen,
} from '@/lib/bark/bark-rail-metadata'
import {
  BARK_MAINNET_SERVER_URL,
  BARK_RECORD_ENVELOPE_MAX_BYTES,
  BARK_SIGNET_SERVER_URL,
  parseWalletPayloadJson,
  type StoredBarkAccount,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

const sdkPersistenceJson = '{"vtxos":[{"id":"keep-me"}]}'
const signetRecordEnvelope = 'c2lnbmV0LWR1bXA='
const mainnetRecordEnvelope = 'bWFpbm5ldC1kdW1w'

function signetAccount(overrides: Partial<StoredBarkAccount> = {}): StoredBarkAccount {
  return {
    id: 'bark-account-signet',
    networkMode: 'signet',
    serverUrl: BARK_SIGNET_SERVER_URL,
    fingerprint: 'abcdef01',
    ...overrides,
  }
}

function payloadWithArkadeSdk(): WalletSecretsPayload {
  return {
    descriptorWallets: [],
    lightningNwcConnections: [],
    arkadeAccounts: [
      {
        id: 'acct-1',
        label: 'signet',
        networkMode: 'signet',
        operatorUrl: 'https://asp.example',
        operatorSignerPkHex: '02abc',
        createdAt: '2020-01-01T00:00:00.000Z',
        sdkPersistenceJson,
      },
    ],
    activeArkadeAccountIdByNetwork: { signet: 'acct-1' },
    barkAccounts: [
      {
        id: 'bark-account-mainnet',
        networkMode: 'mainnet',
        serverUrl: BARK_MAINNET_SERVER_URL,
        fingerprint: 'abcdef01',
        recordEnvelope: mainnetRecordEnvelope,
      },
    ],
  }
}

describe('barkAccounts metadata', () => {
  it('parses a payload that has no bark accounts and defaults to empty array', () => {
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
      }),
    )
    expect(parsed.barkAccounts).toEqual([])
    expect(findBarkAccount(parsed, 'signet')).toBeUndefined()
  })

  it('keeps an over-cap record envelope and refuses to open it', () => {
    const recordEnvelope = 'a'.repeat(BARK_RECORD_ENVELOPE_MAX_BYTES + 1)
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkAccounts: [
          {
            id: 'bark-account-signet',
            networkMode: 'signet',
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            recordEnvelope,
          },
        ],
      }),
    )
    expect(findBarkAccount(parsed, 'signet')?.recordEnvelope).toBe(recordEnvelope)
    expect(() => signetRecordEnvelopeForOpen(parsed)).toThrow(
      `Bark record envelope exceeds ${BARK_RECORD_ENVELOPE_MAX_BYTES} bytes`,
    )
  })

  it('keeps sdkPersistenceJson, the mainnet record envelope, preserves id, and refuses a different fingerprint', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(
      signetAccount({
        lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
        receiveKeyIndex: 0,
        recordEnvelope: signetRecordEnvelope,
      }),
    )

    const next = applyOpenedBarkAccount({ network: 'signet', payload, fingerprint: 'abcdef01' })

    expect(next.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(findBarkAccount(next, 'mainnet')?.recordEnvelope).toBe(mainnetRecordEnvelope)
    expect(findBarkAccount(next, 'signet')).toEqual(
      signetAccount({
        lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
        receiveKeyIndex: 0,
        recordEnvelope: signetRecordEnvelope,
      }),
    )

    expect(() =>
      applyOpenedBarkAccount({ network: 'signet', payload, fingerprint: '00112233' }),
    ).toThrow(BarkFingerprintMismatchError)
    expect(findBarkAccount(payload, 'signet')?.fingerprint).toBe('abcdef01')
  })

  it('creates an account id on first open if none existed', () => {
    const payload = payloadWithArkadeSdk()
    const opened = applyOpenedBarkAccount({
      network: 'signet',
      payload,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 0,
      recordEnvelope: signetRecordEnvelope,
    })
    const signetAcct = findBarkAccount(opened, 'signet')
    expect(signetAcct).toBeDefined()
    expect(signetAcct?.id).toBeTruthy()
    expect(signetAcct?.networkMode).toBe('signet')
    expect(signetAcct?.fingerprint).toBe('abcdef01')
  })

  it('keeps receiveKeyIndex on open and replaces it when a reveal index is passed', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(signetAccount({ receiveKeyIndex: 0, recordEnvelope: signetRecordEnvelope }))

    const opened = applyOpenedBarkAccount({ network: 'signet', payload, fingerprint: 'abcdef01' })
    expect(findBarkAccount(opened, 'signet')?.receiveKeyIndex).toBe(0)
    expect(opened.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(findBarkAccount(opened, 'mainnet')?.recordEnvelope).toBe(mainnetRecordEnvelope)

    const revealed = applyOpenedBarkAccount({
      network: 'signet',
      payload: opened,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 2,
    })
    expect(findBarkAccount(revealed, 'signet')?.receiveKeyIndex).toBe(2)
    expect(findBarkAccount(revealed, 'signet')?.recordEnvelope).toBe(signetRecordEnvelope)
    expect(revealed.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
  })

  it('stamps lastSuccessfulSyncAt and keeps the fingerprint, receive index, and Arkade payload', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(signetAccount({ receiveKeyIndex: 2, recordEnvelope: signetRecordEnvelope }))

    const stamped = applySuccessfulBarkSync({
      network: 'signet',
      payload,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })

    expect(findBarkAccount(stamped, 'signet')).toEqual(
      signetAccount({
        receiveKeyIndex: 2,
        recordEnvelope: signetRecordEnvelope,
        lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      }),
    )
    expect(stamped.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(findBarkAccount(stamped, 'mainnet')?.recordEnvelope).toBe(mainnetRecordEnvelope)
    expect(findBarkAccount(payload, 'signet')?.lastSuccessfulSyncAt).toBeUndefined()
  })

  it('writes a mainnet open and leaves the signet record envelope', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(signetAccount({ recordEnvelope: signetRecordEnvelope, receiveKeyIndex: 1 }))

    const opened = applyOpenedBarkAccount({
      network: 'mainnet',
      payload,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 0,
      recordEnvelope: 'bWFpbm5ldC1vcGVu',
    })

    const mainnetAcct = findBarkAccount(opened, 'mainnet')
    expect(mainnetAcct?.serverUrl).toBe(BARK_MAINNET_SERVER_URL)
    expect(mainnetAcct?.fingerprint).toBe('abcdef01')
    expect(mainnetAcct?.receiveKeyIndex).toBe(0)
    expect(mainnetAcct?.recordEnvelope).toBe('bWFpbm5ldC1vcGVu')
    expect(findBarkAccount(opened, 'signet')?.recordEnvelope).toBe(signetRecordEnvelope)
    expect(opened.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
  })

  it('replaces only the signet record envelope on a protocol flush', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(signetAccount({ receiveKeyIndex: 1, recordEnvelope: signetRecordEnvelope }))
    const nextRecordEnvelope = 'bmV4dC1kdW1w'

    const flushed = applyBarkRecordEnvelope({
      network: 'signet',
      payload,
      recordEnvelope: nextRecordEnvelope,
      receiveKeyIndex: 3,
    })

    expect(findBarkAccount(flushed, 'signet')?.recordEnvelope).toBe(nextRecordEnvelope)
    expect(findBarkAccount(flushed, 'signet')?.receiveKeyIndex).toBe(3)
    expect(findBarkAccount(flushed, 'mainnet')?.recordEnvelope).toBe(mainnetRecordEnvelope)
    expect(flushed.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(findBarkAccount(payload, 'signet')?.recordEnvelope).toBe(signetRecordEnvelope)
  })

  it('refuses to stamp when the account is missing or the timestamp is not ISO-8601', () => {
    const payload = payloadWithArkadeSdk()
    expect(() =>
      applySuccessfulBarkSync({
        network: 'signet',
        payload,
        syncedAt: '2024-03-01T12:00:00.000Z',
      }),
    ).toThrow('Bark account is missing')

    payload.barkAccounts.push(
      signetAccount({
        receiveKeyIndex: 0,
        lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
      }),
    )
    expect(() =>
      applySuccessfulBarkSync({
        network: 'signet',
        payload,
        syncedAt: 'not-a-timestamp',
      }),
    ).toThrow('Bark sync timestamp must be a parseable ISO-8601 string')
    expect(findBarkAccount(payload, 'signet')?.lastSuccessfulSyncAt).toBe('2020-06-01T00:00:00.000Z')
  })

  it('keeps a pending emergency claim across a sync stamp and a record envelope flush', () => {
    const pendingEmergencyClaim = { txid: 'claim-txid', vtxoIds: ['vtxo-1'] }
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(
      signetAccount({
        receiveKeyIndex: 2,
        recordEnvelope: signetRecordEnvelope,
        pendingEmergencyClaim,
      }),
    )

    const stamped = applySuccessfulBarkSync({
      network: 'signet',
      payload,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })
    expect(findBarkAccount(stamped, 'signet')?.pendingEmergencyClaim).toEqual(pendingEmergencyClaim)

    const flushed = applyBarkRecordEnvelope({
      network: 'signet',
      payload: stamped,
      recordEnvelope: 'bmV4dC1kdW1w',
    })
    expect(findBarkAccount(flushed, 'signet')?.pendingEmergencyClaim).toEqual(pendingEmergencyClaim)
    expect(findBarkAccount(flushed, 'signet')?.recordEnvelope).toBe('bmV4dC1kdW1w')

    const cleared = applyPendingEmergencyClaim({
      payload: flushed,
      network: 'signet',
      pending: null,
    })
    expect(findBarkAccount(cleared, 'signet')?.pendingEmergencyClaim).toBeUndefined()
    expect(findBarkAccount(cleared, 'signet')?.recordEnvelope).toBe('bmV4dC1kdW1w')
  })

  it('omits a malformed pending emergency claim and keeps the record envelope', () => {
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkAccounts: [
          {
            id: 'bark-account-signet',
            networkMode: 'signet',
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            recordEnvelope: signetRecordEnvelope,
            pendingEmergencyClaim: { txid: '', vtxoIds: [] },
          },
        ],
      }),
    )
    expect(findBarkAccount(parsed, 'signet')?.recordEnvelope).toBe(signetRecordEnvelope)
    expect(findBarkAccount(parsed, 'signet')?.pendingEmergencyClaim).toBeUndefined()
  })

  it('keeps an exit seizure notice across a sync stamp and clears it only when dismissed', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(
      signetAccount({
        receiveKeyIndex: 2,
        recordEnvelope: signetRecordEnvelope,
        exitSeizureVtxoIds: ['vtxo-a'],
      }),
    )

    const merged = applyMergedExitSeizureVtxoIds({
      network: 'signet',
      payload,
      vtxoIds: ['vtxo-c', 'vtxo-a'],
    })
    expect(findBarkAccount(merged, 'signet')?.exitSeizureVtxoIds).toEqual([
      'vtxo-a',
      'vtxo-c',
    ])
    expect(findBarkAccount(merged, 'mainnet')?.exitSeizureVtxoIds).toBeUndefined()

    const stamped = applySuccessfulBarkSync({
      network: 'signet',
      payload: merged,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })
    expect(findBarkAccount(stamped, 'signet')?.exitSeizureVtxoIds).toEqual([
      'vtxo-a',
      'vtxo-c',
    ])

    const flushed = applyBarkRecordEnvelope({
      network: 'signet',
      payload: stamped,
      recordEnvelope: 'bmV4dC1kdW1w',
    })
    expect(findBarkAccount(flushed, 'signet')?.exitSeizureVtxoIds).toEqual([
      'vtxo-a',
      'vtxo-c',
    ])

    const unchanged = applyMergedExitSeizureVtxoIds({
      network: 'signet',
      payload: flushed,
      vtxoIds: [],
    })
    expect(findBarkAccount(unchanged, 'signet')?.exitSeizureVtxoIds).toEqual([
      'vtxo-a',
      'vtxo-c',
    ])

    const cleared = applyClearedExitSeizureNotice({ payload: unchanged, network: 'signet' })
    expect(findBarkAccount(cleared, 'signet')?.exitSeizureVtxoIds).toBeUndefined()
    expect(findBarkAccount(cleared, 'signet')?.recordEnvelope).toBe('bmV4dC1kdW1w')
    expect(findBarkAccount(cleared, 'mainnet')?.recordEnvelope).toBe(mainnetRecordEnvelope)
  })

  it('omits a malformed exit seizure notice and keeps the record envelope', () => {
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkAccounts: [
          {
            id: 'bark-account-signet',
            networkMode: 'signet',
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            recordEnvelope: signetRecordEnvelope,
            exitSeizureVtxoIds: ['vtxo-a', ''],
          },
        ],
      }),
    )
    expect(findBarkAccount(parsed, 'signet')?.recordEnvelope).toBe(signetRecordEnvelope)
    expect(findBarkAccount(parsed, 'signet')?.exitSeizureVtxoIds).toBeUndefined()
  })

  it('keeps proceed automatically across a sync stamp and a record envelope flush', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(
      signetAccount({
        receiveKeyIndex: 2,
        recordEnvelope: signetRecordEnvelope,
        proceedAutomatically: true,
      }),
    )

    const stamped = applySuccessfulBarkSync({
      network: 'signet',
      payload,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })
    expect(findBarkAccount(stamped, 'signet')?.proceedAutomatically).toBe(true)

    const flushed = applyBarkRecordEnvelope({
      network: 'signet',
      payload: stamped,
      recordEnvelope: 'bmV4dC1kdW1w',
    })
    expect(findBarkAccount(flushed, 'signet')?.proceedAutomatically).toBe(true)
    expect(findBarkAccount(flushed, 'signet')?.recordEnvelope).toBe('bmV4dC1kdW1w')

    const turnedOff = applyProceedAutomatically({
      payload: flushed,
      network: 'signet',
      enabled: false,
    })
    expect(findBarkAccount(turnedOff, 'signet')?.proceedAutomatically).toBeUndefined()
    expect(findBarkAccount(turnedOff, 'signet')?.recordEnvelope).toBe('bmV4dC1kdW1w')
  })

  it('omits a non-boolean proceed automatically flag and keeps the record envelope', () => {
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkAccounts: [
          {
            id: 'bark-account-signet',
            networkMode: 'signet',
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            recordEnvelope: signetRecordEnvelope,
            proceedAutomatically: 'yes',
          },
        ],
      }),
    )
    expect(findBarkAccount(parsed, 'signet')?.recordEnvelope).toBe(signetRecordEnvelope)
    expect(findBarkAccount(parsed, 'signet')?.proceedAutomatically).toBeUndefined()
  })

  it('keeps the emergency-exit fee degree and max across a sync flush and drops malformed values', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkAccounts.push(
      signetAccount({
        recordEnvelope: signetRecordEnvelope,
        proceedAutomatically: true,
        emergencyExitFeePreset: 'Low',
        emergencyExitMaxFeeRateSatPerVb: 12,
      }),
    )

    const stamped = applySuccessfulBarkSync({
      network: 'signet',
      payload,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })
    expect(findBarkAccount(stamped, 'signet')?.emergencyExitFeePreset).toBe('Low')
    expect(findBarkAccount(stamped, 'signet')?.emergencyExitMaxFeeRateSatPerVb).toBe(12)

    const changed = applyEmergencyExitFeePreset({
      payload: stamped,
      network: 'signet',
      feePreset: 'High',
    })
    const capped = applyEmergencyExitMaxFeeRate({
      payload: changed,
      network: 'signet',
      maxFeeRateSatPerVb: 25,
    })
    expect(findBarkAccount(capped, 'signet')?.emergencyExitFeePreset).toBe('High')
    expect(findBarkAccount(capped, 'signet')?.emergencyExitMaxFeeRateSatPerVb).toBe(25)
    expect(findBarkAccount(capped, 'signet')?.recordEnvelope).toBe(signetRecordEnvelope)
    expect(findBarkAccount(capped, 'signet')?.proceedAutomatically).toBe(true)

    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkAccounts: [
          {
            id: 'bark-account-signet',
            networkMode: 'signet',
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            recordEnvelope: signetRecordEnvelope,
            emergencyExitFeePreset: 'custom',
            emergencyExitMaxFeeRateSatPerVb: 0,
          },
        ],
      }),
    )
    expect(findBarkAccount(parsed, 'signet')?.recordEnvelope).toBe(signetRecordEnvelope)
    expect(findBarkAccount(parsed, 'signet')?.emergencyExitFeePreset).toBeUndefined()
    expect(findBarkAccount(parsed, 'signet')?.emergencyExitMaxFeeRateSatPerVb).toBeUndefined()
  })

  it('drops an account whose receiveKeyIndex is not a u32', () => {
    const dropped = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkAccounts: [
          {
            id: 'bark-account-signet',
            networkMode: 'signet',
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            receiveKeyIndex: -1,
          },
        ],
      }),
    )
    expect(dropped.barkAccounts).toEqual([])

    const fractional = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkAccounts: [
          {
            id: 'bark-account-signet',
            networkMode: 'signet',
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            receiveKeyIndex: 1.5,
          },
        ],
      }),
    )
    expect(fractional.barkAccounts).toEqual([])
  })

  it('findBarkAccount and requireBarkAccount behave as expected', () => {
    const payload = payloadWithArkadeSdk()
    expect(findBarkAccount(payload, 'mainnet')).toBeDefined()
    expect(requireBarkAccount(payload, 'mainnet').networkMode).toBe('mainnet')
    expect(() => requireBarkAccount(payload, 'regtest')).toThrow('Bark account is missing')
  })
})
