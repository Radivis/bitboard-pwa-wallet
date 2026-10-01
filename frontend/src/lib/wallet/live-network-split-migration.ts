import type { Kysely } from 'kysely'
import { ensureMigrated, getDatabase } from '@/db/database'
import type { Database } from '@/db/schema'
import {
  classifyHistoricalSignetEsplora,
  LIVE_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY,
  LIVE_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY,
  MUTINYNET_ESPLORA_SETTINGS_KEY,
  parseHistoricalSignetOnchainChain,
  setConfiguredHistoricalSignetOnchainChain,
  SIGNET_ESPLORA_SETTINGS_KEY,
  type HistoricalSignetOnchainChain,
} from '@/lib/wallet/historical-signet-onchain-chain'

let liveNetworkSplitMigrationPromise: Promise<HistoricalSignetOnchainChain> | null = null

/** Clears the in-memory migration latch. Tests only. */
export function resetLiveNetworkSplitMigrationForTests(): void {
  liveNetworkSplitMigrationPromise = null
}

/** Pushes the classified chain into a worker before it parses wallet secrets. */
export async function configureWorkerHistoricalSignetOnchainChain(
  configure: (chain: HistoricalSignetOnchainChain | null) => Promise<void>,
): Promise<void> {
  try {
    const chain = await ensureLiveNetworkSplitMigrated()
    await configure(chain)
  } catch (migrationError) {
    console.error('Signet/Mutinynet split migration failed:', migrationError)
    await configure(null)
  }
}

/**
 * Classifies the pre-split Signet Esplora row once and remembers the chain.
 * A Mutinynet URL moves to the mutinynet settings key. Public Signet and
 * other custom hosts stay on the signet key.
 */
export async function ensureLiveNetworkSplitMigrated(): Promise<HistoricalSignetOnchainChain> {
  if (liveNetworkSplitMigrationPromise) {
    return liveNetworkSplitMigrationPromise
  }
  liveNetworkSplitMigrationPromise = migrateLiveNetworkSplitOnce()
  try {
    return await liveNetworkSplitMigrationPromise
  } catch (migrationError) {
    liveNetworkSplitMigrationPromise = null
    throw migrationError
  }
}

async function migrateLiveNetworkSplitOnce(): Promise<HistoricalSignetOnchainChain> {
  await ensureMigrated()
  const chain = await migrateLiveNetworkSplitEsploraSettings(getDatabase())
  setConfiguredHistoricalSignetOnchainChain(chain)
  return chain
}

export async function migrateLiveNetworkSplitEsploraSettings(
  walletDb: Kysely<Database>,
): Promise<HistoricalSignetOnchainChain> {
  const migrationFlag = await readSetting(walletDb, LIVE_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY)
  if (migrationFlag != null) {
    const storedChain = parseHistoricalSignetOnchainChain(
      await readSetting(walletDb, LIVE_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY),
    )
    const chain = storedChain ?? 'mutinynet'
    if (storedChain == null) {
      await writeSetting(walletDb, LIVE_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY, chain)
    }
    setConfiguredHistoricalSignetOnchainChain(chain)
    return chain
  }

  const legacySignetUrl = await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)
  const chain = classifyHistoricalSignetEsplora(legacySignetUrl)

  await walletDb.transaction().execute(async (transaction) => {
    if (chain === 'mutinynet' && legacySignetUrl != null) {
      await moveSignetEsploraUrlToMutinynet(transaction, legacySignetUrl)
    }
    await writeSetting(transaction, LIVE_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY, chain)
    await writeSetting(transaction, LIVE_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY, '1')
  })

  setConfiguredHistoricalSignetOnchainChain(chain)
  return chain
}

async function moveSignetEsploraUrlToMutinynet(
  walletDb: Kysely<Database>,
  legacySignetUrl: string,
): Promise<void> {
  const mutinynetUrl = await readSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY)
  if (mutinynetUrl == null) {
    await writeSetting(walletDb, MUTINYNET_ESPLORA_SETTINGS_KEY, legacySignetUrl)
  }
  await walletDb
    .deleteFrom('settings')
    .where('key', '=', SIGNET_ESPLORA_SETTINGS_KEY)
    .execute()
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

async function writeSetting(
  walletDb: Kysely<Database>,
  key: string,
  value: string,
): Promise<void> {
  await walletDb
    .insertInto('settings')
    .values({ key, value })
    .onConflict((conflict) => conflict.column('key').doUpdateSet({ value }))
    .execute()
}
