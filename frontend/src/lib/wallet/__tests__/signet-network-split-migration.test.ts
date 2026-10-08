import { afterEach, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import { createTestDatabase } from '@/db/test-helpers'
import type { Database } from '@/db/schema'
import {
  classifyHistoricalSignetEsplora,
  MUTINYNET_ESPLORA_SETTINGS_KEY,
  setConfiguredHistoricalSignetOnchainChain,
  SIGNET_ESPLORA_SETTINGS_KEY,
  SIGNET_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY,
  SIGNET_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY,
} from '@/lib/wallet/historical-signet-onchain-chain'
import {
  migrateSignetNetworkSplitEsploraSettings,
  resetSignetNetworkSplitMigrationForTests,
} from '@/lib/wallet/signet-network-split-migration'

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

describe('migrateSignetNetworkSplitEsploraSettings', () => {
  let walletDb: Kysely<Database>

  afterEach(async () => {
    setConfiguredHistoricalSignetOnchainChain(null)
    resetSignetNetworkSplitMigrationForTests()
    await walletDb.destroy()
  })

  it('moves a Mutinynet URL onto the mutinynet key', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY, 'https://mutinynet.com/api')

    const chain = await migrateSignetNetworkSplitEsploraSettings(walletDb)

    expect(chain).toBe('mutinynet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBeNull()
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://mutinynet.com/api',
    )
    expect(await readSetting(walletDb, SIGNET_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY)).toBe('mutinynet')
  })

  it('leaves a public Signet URL on the signet key', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(
      walletDb,
      SIGNET_ESPLORA_SETTINGS_KEY,
      'https://mempool.space/signet/api',
    )

    const chain = await migrateSignetNetworkSplitEsploraSettings(walletDb)

    expect(chain).toBe('public-signet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://mempool.space/signet/api',
    )
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBeNull()
  })

  it('leaves an unrecognized host on the signet key', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY, 'https://example.com/api')

    const chain = await migrateSignetNetworkSplitEsploraSettings(walletDb)

    expect(chain).toBe('custom-host')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://example.com/api',
    )
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBeNull()
  })

  it('does not move a later public Signet URL after the flag is set', async () => {
    walletDb = await createTestDatabase()
    await insertSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY, 'https://mutinynet.com/api')
    await migrateSignetNetworkSplitEsploraSettings(walletDb)
    await insertSetting(
      walletDb,
      SIGNET_ESPLORA_SETTINGS_KEY,
      'https://mempool.space/signet/api',
    )

    const chain = await migrateSignetNetworkSplitEsploraSettings(walletDb)

    expect(chain).toBe('mutinynet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://mempool.space/signet/api',
    )
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBe(
      'https://mutinynet.com/api',
    )
    expect(await readSetting(walletDb, SIGNET_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY)).toBe('1')
  })

  it('records mutinynet when there was no custom URL', async () => {
    walletDb = await createTestDatabase()

    const chain = await migrateSignetNetworkSplitEsploraSettings(walletDb)

    expect(chain).toBe('mutinynet')
    expect(await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)).toBeNull()
    expect(await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)).toBeNull()
  })
})
