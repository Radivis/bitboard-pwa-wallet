import { afterEach, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import { createTestDatabase } from '@/db/test-helpers'
import type { Database } from '@/db/schema'
import { SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME } from '@/db/data-migrations/data-migration-names'
import {
  readDeviceDataMigrationResult,
  runDeviceDataMigrations,
} from '@/db/data-migrations/device-data-migrations'
import {
  classifyHistoricalSignetEsplora,
  LEGACY_SIGNET_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY,
  LEGACY_SIGNET_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY,
  MUTINYNET_ESPLORA_SETTINGS_KEY,
  setConfiguredHistoricalSignetOnchainChain,
  SIGNET_ESPLORA_SETTINGS_KEY,
} from '@/lib/wallet/historical-signet-onchain-chain'
import {
  applySignetNetworkSplitToPayload,
  dropDescriptorWalletsContradictingTheirNetwork,
  repairMutinynetArkadeOperatorUrl,
} from '@/lib/wallet/signet-network-split-migration'
import {
  AddressType,
  type DescriptorWalletData,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import {
  bdkChangesetJson,
  MUTINYNET_ANCHOR_HEIGHT,
  MUTINYNET_TIP_HEIGHT,
  PUBLIC_SIGNET_ANCHOR_HEIGHT,
  PUBLIC_SIGNET_TIP_HEIGHT,
} from '@/test-utils/bdk-changeset-json-fixtures'

async function insertSetting(
  walletDb: Kysely<Database>,
  key: string,
  value: string,
): Promise<void> {
  await walletDb.insertInto('settings').values({ key, value }).execute()
}

async function readSetting(
  walletDb: Kysely<Database>,
  key: string,
): Promise<string | null> {
  const settingsRow = await walletDb
    .selectFrom('settings')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst()
  return settingsRow?.value ?? null
}

async function runSignetSplitDeviceStep(walletDb: Kysely<Database>): Promise<string | null> {
  await runDeviceDataMigrations(walletDb)
  return readDeviceDataMigrationResult(walletDb, SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME)
}

describe('classifyHistoricalSignetEsplora', () => {
  it('treats a missing URL as Mutinynet', () => {
    expect(classifyHistoricalSignetEsplora(null)).toBe('mutinynet')
    expect(classifyHistoricalSignetEsplora('')).toBe('mutinynet')
  })

  it('treats mutinynet.com and the old default proxy as Mutinynet', () => {
    expect(classifyHistoricalSignetEsplora('https://mutinynet.com/api')).toBe('mutinynet')
    expect(
      classifyHistoricalSignetEsplora('http://127.0.0.1:5173/api/esplora/default/signet'),
    ).toBe('mutinynet')
  })

  it('treats mempool and blockstream signet as public signet', () => {
    expect(classifyHistoricalSignetEsplora('https://mempool.space/signet/api')).toBe(
      'public-signet',
    )
    expect(classifyHistoricalSignetEsplora('https://blockstream.info/signet/api')).toBe(
      'public-signet',
    )
    expect(
      classifyHistoricalSignetEsplora('http://localhost:5173/api/esplora/legacy/signet'),
    ).toBe('public-signet')
  })

  it('does not guess for some other host', () => {
    expect(classifyHistoricalSignetEsplora('https://example.com/api')).toBe('custom-host')
  })
})

describe('signet network split device data migration', () => {
  let walletDb: Kysely<Database>

  afterEach(async () => {
    setConfiguredHistoricalSignetOnchainChain(null)
    await walletDb.destroy()
  })

  it('moves a Mutinynet URL onto the mutinynet key and records mutinynet', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY, 'https://mutinynet.com/api')

    const chain = await runSignetSplitDeviceStep(walletDb)

    expect(chain).toBe('mutinynet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBeNull()
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://mutinynet.com/api',
    )
  })

  it('leaves a public Signet URL on the signet key', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(
      walletDb,
      SIGNET_ESPLORA_SETTINGS_KEY,
      'https://mempool.space/signet/api',
    )

    const chain = await runSignetSplitDeviceStep(walletDb)

    expect(chain).toBe('public-signet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://mempool.space/signet/api',
    )
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBeNull()
  })

  it('leaves an unrecognized host on the signet key', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY, 'https://example.com/api')

    const chain = await runSignetSplitDeviceStep(walletDb)

    expect(chain).toBe('custom-host')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://example.com/api',
    )
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBeNull()
  })

  it('records mutinynet when there was no custom URL', async () => {
    walletDb = await createTestDatabase()

    const chain = await runSignetSplitDeviceStep(walletDb)

    expect(chain).toBe('mutinynet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBeNull()
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBeNull()
  })

  it('runs once so a later public Signet URL is not moved', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY, 'https://mutinynet.com/api')
    await runDeviceDataMigrations(walletDb)
    await insertSetting(
      walletDb,
      SIGNET_ESPLORA_SETTINGS_KEY,
      'https://mempool.space/signet/api',
    )

    const chain = await runSignetSplitDeviceStep(walletDb)

    expect(chain).toBe('mutinynet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://mempool.space/signet/api',
    )
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://mutinynet.com/api',
    )
    const migrationRows = await walletDb
      .selectFrom('device_data_migrations')
      .selectAll()
      .execute()
    expect(migrationRows).toHaveLength(1)
  })

  it('adopts the legacy pre-release settings classification and drops the legacy keys', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(walletDb, LEGACY_SIGNET_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY, '1')
    await insertSetting(walletDb, LEGACY_SIGNET_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY, 'public-signet')
    await insertSetting(
      walletDb,
      SIGNET_ESPLORA_SETTINGS_KEY,
      'https://example.com/api',
    )

    const chain = await runSignetSplitDeviceStep(walletDb)

    expect(chain).toBe('public-signet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://example.com/api',
    )
    expect(
      await readSetting(walletDb, LEGACY_SIGNET_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY),
    ).toBeNull()
    expect(await readSetting(walletDb, LEGACY_SIGNET_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY)).toBeNull()
  })
})

const signetDescriptorWallet = {
  network: 'signet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
  externalDescriptor: 'tr(xpub.../0/*)',
  internalDescriptor: 'tr(xpub.../1/*)',
  changeSet: '{}',
  fullScanDone: false,
}

const signetNwcConnection = {
  id: 'conn-1',
  label: 'LN',
  networkMode: 'signet' as const,
  connectionString: 'nostr+walletconnect://abc?relay=wss%3A%2F%2Fx&secret=y',
  createdAt: '2020-01-01T00:00:00.000Z',
}

const HISTORICAL_SIGNET_OPERATOR_PROXY_URL = 'http://127.0.0.1:5173/api/arkade/operator/signet'
const MUTINYNET_OPERATOR_PROXY_URL = 'http://127.0.0.1:5173/api/arkade/operator/mutinynet'

const signetArkadeAccount = {
  id: 'acct-good',
  label: 'Mutinynet',
  networkMode: 'signet' as const,
  operatorUrl: HISTORICAL_SIGNET_OPERATOR_PROXY_URL,
  operatorSignerPkHex: '02abc',
  createdAt: '2020-01-01T00:00:00.000Z',
}

const signetBarkAccount = {
  id: 'bark-signet',
  networkMode: 'signet' as const,
  serverUrl: 'https://ark.signet.2nd.dev',
  fingerprint: 'abcdef01',
}

function createPreSplitPayload(): WalletSecretsPayload {
  return {
    descriptorWallets: [{ ...signetDescriptorWallet }],
    lightningNwcConnections: [{ ...signetNwcConnection }],
    arkadeAccounts: [{ ...signetArkadeAccount }],
    activeArkadeAccountIdByNetwork: { signet: 'acct-good' },
    barkAccounts: [{ ...signetBarkAccount }],
  }
}

describe('applySignetNetworkSplitToPayload', () => {
  it('moves descriptors, NWC and Arkade for Mutinynet and leaves Bark', () => {
    const migrated = applySignetNetworkSplitToPayload(createPreSplitPayload(), 'mutinynet')

    expect(migrated.descriptorWallets[0].network).toBe('mutinynet')
    expect(migrated.lightningNwcConnections[0].networkMode).toBe('mutinynet')
    expect(migrated.arkadeAccounts[0].networkMode).toBe('mutinynet')
    expect(migrated.arkadeAccounts[0].operatorUrl).toBe(MUTINYNET_OPERATOR_PROXY_URL)
    expect(migrated.activeArkadeAccountIdByNetwork).toEqual({ mutinynet: 'acct-good' })
    expect(migrated.barkAccounts).toEqual([signetBarkAccount])
  })

  it('keeps descriptors and NWC on signet for other chains but moves Arkade', () => {
    for (const chain of ['public-signet', 'custom-host'] as const) {
      const migrated = applySignetNetworkSplitToPayload(createPreSplitPayload(), chain)

      expect(migrated.descriptorWallets[0].network).toBe('signet')
      expect(migrated.lightningNwcConnections[0].networkMode).toBe('signet')
      expect(migrated.arkadeAccounts[0].networkMode).toBe('mutinynet')
      expect(migrated.arkadeAccounts[0].operatorUrl).toBe(MUTINYNET_OPERATOR_PROXY_URL)
      expect(migrated.activeArkadeAccountIdByNetwork).toEqual({ mutinynet: 'acct-good' })
      expect(migrated.barkAccounts).toEqual([signetBarkAccount])
    }
  })

  it('leaves a non-proxy Arkade operator URL unchanged when moving the account', () => {
    const payload = createPreSplitPayload()
    payload.arkadeAccounts[0].operatorUrl = 'https://asp.example/custom'

    const migrated = applySignetNetworkSplitToPayload(payload, 'mutinynet')

    expect(migrated.arkadeAccounts[0].networkMode).toBe('mutinynet')
    expect(migrated.arkadeAccounts[0].operatorUrl).toBe('https://asp.example/custom')
  })

  it('rewrites a trailing-slash Signet operator proxy path', () => {
    const payload = createPreSplitPayload()
    payload.arkadeAccounts[0].operatorUrl = `${HISTORICAL_SIGNET_OPERATOR_PROXY_URL}/`

    const migrated = applySignetNetworkSplitToPayload(payload, 'mutinynet')

    expect(migrated.arkadeAccounts[0].operatorUrl).toBe(MUTINYNET_OPERATOR_PROXY_URL)
  })

  it('leaves a legacy-flagged payload unchanged and strips the flag', () => {
    const legacyFlaggedPayload = {
      ...createPreSplitPayload(),
      signetNetworkSplitApplied: true,
    } as WalletSecretsPayload

    const migrated = applySignetNetworkSplitToPayload(legacyFlaggedPayload, 'mutinynet')

    expect(migrated).toEqual(createPreSplitPayload())
    expect(migrated).not.toHaveProperty('signetNetworkSplitApplied')
  })
})

describe('repairMutinynetArkadeOperatorUrl', () => {
  it('rewrites a Mutinynet account that still uses the Signet proxy path', () => {
    const payload = createPreSplitPayload()
    payload.arkadeAccounts[0] = {
      ...payload.arkadeAccounts[0],
      networkMode: 'mutinynet',
      sdkPersistenceJson: '{"operator_identity":{"network":"signet"}}',
    }

    const repaired = repairMutinynetArkadeOperatorUrl(payload)

    expect(repaired.arkadeAccounts[0].networkMode).toBe('mutinynet')
    expect(repaired.arkadeAccounts[0].operatorUrl).toBe(MUTINYNET_OPERATOR_PROXY_URL)
    expect(repaired.arkadeAccounts[0].sdkPersistenceJson).toBe(
      '{"operator_identity":{"network":"signet"}}',
    )
  })

  it('leaves a public Signet account on the Signet proxy path', () => {
    const payload = createPreSplitPayload()

    const repaired = repairMutinynetArkadeOperatorUrl(payload)

    expect(repaired.arkadeAccounts[0]).toEqual(payload.arkadeAccounts[0])
  })

  it('leaves an already-correct Mutinynet proxy URL unchanged', () => {
    const payload = createPreSplitPayload()
    payload.arkadeAccounts[0] = {
      ...payload.arkadeAccounts[0],
      networkMode: 'mutinynet',
      operatorUrl: MUTINYNET_OPERATOR_PROXY_URL,
    }

    const repaired = repairMutinynetArkadeOperatorUrl(payload)

    expect(repaired.arkadeAccounts[0].operatorUrl).toBe(MUTINYNET_OPERATOR_PROXY_URL)
    expect(repaired.arkadeAccounts[0].networkMode).toBe('mutinynet')
  })
})

const publicSignetHistoryChangeset = bdkChangesetJson({
  blockHeights: [0, PUBLIC_SIGNET_ANCHOR_HEIGHT, PUBLIC_SIGNET_TIP_HEIGHT],
  anchorHeights: [PUBLIC_SIGNET_ANCHOR_HEIGHT],
})

const mutinynetHistoryChangeset = bdkChangesetJson({
  blockHeights: [0, MUTINYNET_ANCHOR_HEIGHT, MUTINYNET_TIP_HEIGHT],
  anchorHeights: [MUTINYNET_ANCHOR_HEIGHT],
})

const publicSignetAnchorsUnderMutinynetTipChangeset = bdkChangesetJson({
  blockHeights: [0, PUBLIC_SIGNET_ANCHOR_HEIGHT, MUTINYNET_TIP_HEIGHT],
  anchorHeights: [PUBLIC_SIGNET_ANCHOR_HEIGHT],
})

const mixedHistoryChangeset = bdkChangesetJson({
  blockHeights: [0, PUBLIC_SIGNET_ANCHOR_HEIGHT, MUTINYNET_ANCHOR_HEIGHT],
  anchorHeights: [PUBLIC_SIGNET_ANCHOR_HEIGHT, MUTINYNET_ANCHOR_HEIGHT],
})

function descriptorRow(
  network: DescriptorWalletData['network'],
  changeSet: string,
  accountId = 0,
): DescriptorWalletData {
  return { ...signetDescriptorWallet, network, accountId, changeSet, fullScanDone: true }
}

function payloadWithDescriptorRows(
  descriptorWallets: DescriptorWalletData[],
): WalletSecretsPayload {
  return { ...createPreSplitPayload(), descriptorWallets }
}

describe('dropDescriptorWalletsContradictingTheirNetwork', () => {
  it('drops a signet row with Mutinynet history', () => {
    const payload = payloadWithDescriptorRows([descriptorRow('signet', mutinynetHistoryChangeset)])

    const repaired = dropDescriptorWalletsContradictingTheirNetwork(payload)

    expect(repaired.descriptorWallets).toEqual([])
  })

  it('drops a mutinynet row with public Signet anchors under a Mutinynet tip', () => {
    const payload = payloadWithDescriptorRows([
      descriptorRow('mutinynet', publicSignetAnchorsUnderMutinynetTipChangeset),
    ])

    const repaired = dropDescriptorWalletsContradictingTheirNetwork(payload)

    expect(repaired.descriptorWallets).toEqual([])
  })

  it('drops mixed rows on either network', () => {
    const payload = payloadWithDescriptorRows([
      descriptorRow('signet', mixedHistoryChangeset, 0),
      descriptorRow('mutinynet', mixedHistoryChangeset, 1),
    ])

    const repaired = dropDescriptorWalletsContradictingTheirNetwork(payload)

    expect(repaired.descriptorWallets).toEqual([])
  })

  it('keeps matching, unknown, empty and non-signet-family rows unchanged', () => {
    const keptRows = [
      descriptorRow('signet', publicSignetHistoryChangeset, 0),
      descriptorRow('mutinynet', mutinynetHistoryChangeset, 0),
      descriptorRow('signet', '{}', 1),
      descriptorRow('mutinynet', bdkChangesetJson({ blockHeights: [0] }), 1),
      descriptorRow('testnet', mutinynetHistoryChangeset, 0),
      descriptorRow('regtest', mutinynetHistoryChangeset, 0),
    ]
    const payload = payloadWithDescriptorRows(keptRows)

    const repaired = dropDescriptorWalletsContradictingTheirNetwork(payload)

    expect(repaired.descriptorWallets).toEqual(keptRows)
  })

  it('leaves Arkade accounts, Lightning connections and active Arkade ids unchanged', () => {
    const payload = payloadWithDescriptorRows([descriptorRow('signet', mutinynetHistoryChangeset)])

    const repaired = dropDescriptorWalletsContradictingTheirNetwork(payload)

    expect(repaired.arkadeAccounts).toEqual(payload.arkadeAccounts)
    expect(repaired.lightningNwcConnections).toEqual(payload.lightningNwcConnections)
    expect(repaired.activeArkadeAccountIdByNetwork).toEqual(payload.activeArkadeAccountIdByNetwork)
    expect(repaired.barkAccounts).toEqual(payload.barkAccounts)
  })
})
