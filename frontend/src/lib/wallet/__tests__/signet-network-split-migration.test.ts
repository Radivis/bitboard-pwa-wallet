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
import { applySignetNetworkSplitToPayload } from '@/lib/wallet/signet-network-split-migration'
import {
  AddressType,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

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

const signetArkadeAccount = {
  id: 'acct-good',
  label: 'Mutinynet',
  networkMode: 'signet' as const,
  operatorUrl: 'https://signet.arkade.example/v1',
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
    expect(migrated.activeArkadeAccountIdByNetwork).toEqual({ mutinynet: 'acct-good' })
    expect(migrated.barkAccounts).toEqual([signetBarkAccount])
  })

  it('keeps descriptors and NWC on signet for other chains but moves Arkade', () => {
    for (const chain of ['public-signet', 'custom-host'] as const) {
      const migrated = applySignetNetworkSplitToPayload(createPreSplitPayload(), chain)

      expect(migrated.descriptorWallets[0].network).toBe('signet')
      expect(migrated.lightningNwcConnections[0].networkMode).toBe('signet')
      expect(migrated.arkadeAccounts[0].networkMode).toBe('mutinynet')
      expect(migrated.activeArkadeAccountIdByNetwork).toEqual({ mutinynet: 'acct-good' })
      expect(migrated.barkAccounts).toEqual([signetBarkAccount])
    }
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
