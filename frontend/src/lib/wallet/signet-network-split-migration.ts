import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import {
  classifyHistoricalSignetEsplora,
  historicalSignetOnchainWasMutinynet,
  LEGACY_SIGNET_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY,
  LEGACY_SIGNET_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY,
  MUTINYNET_ESPLORA_SETTINGS_KEY,
  parseHistoricalSignetOnchainChain,
  renameSignetMapKeyToMutinynet,
  SIGNET_ESPLORA_SETTINGS_KEY,
  type HistoricalSignetOnchainChain,
} from '@/lib/wallet/historical-signet-onchain-chain'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

/**
 * Pre-release builds set this inside the encrypted payload once they had
 * rewritten it. Such payloads must not be rewritten a second time, because
 * their `signet` rows are public Signet by now.
 */
const LEGACY_SIGNET_NETWORK_SPLIT_APPLIED_FIELD = 'signetNetworkSplitApplied'

/**
 * Device step: classifies the pre-split Signet Esplora row and returns the chain.
 * A Mutinynet URL moves to the mutinynet settings key. Public Signet and
 * other custom hosts stay on the signet key.
 */
export async function migrateSignetNetworkSplitDeviceSettings(
  walletDb: Kysely<Database>,
): Promise<HistoricalSignetOnchainChain> {
  const legacyChain = await adoptLegacySignetNetworkSplitClassification(walletDb)
  if (legacyChain != null) return legacyChain

  const legacySignetUrl = await readSetting(walletDb, SIGNET_ESPLORA_SETTINGS_KEY)
  const chain = classifyHistoricalSignetEsplora(legacySignetUrl)
  if (chain === 'mutinynet' && legacySignetUrl != null) {
    await moveSignetEsploraUrlToMutinynet(walletDb, legacySignetUrl)
  }
  return chain
}

/**
 * Wallet step: historical Arkade `signet` rows were the Mutinynet operator.
 * Descriptors and Lightning connections move to Mutinynet only when the
 * pre-split Esplora chain was Mutinynet. Bark stays on public Signet.
 */
export function applySignetNetworkSplitToPayload(
  payload: WalletSecretsPayload,
  chain: HistoricalSignetOnchainChain,
): WalletSecretsPayload {
  if (hasLegacySignetNetworkSplitAppliedFlag(payload)) {
    return withoutLegacySignetNetworkSplitAppliedFlag(payload)
  }

  const onchainWasMutinynet = historicalSignetOnchainWasMutinynet(chain)
  return {
    ...payload,
    descriptorWallets: onchainWasMutinynet
      ? payload.descriptorWallets.map(moveSignetNetworkToMutinynet)
      : payload.descriptorWallets,
    lightningNwcConnections: onchainWasMutinynet
      ? payload.lightningNwcConnections.map(moveSignetNetworkModeToMutinynet)
      : payload.lightningNwcConnections,
    arkadeAccounts: payload.arkadeAccounts.map(moveSignetNetworkModeToMutinynet),
    activeArkadeAccountIdByNetwork: copyWithSignetKeyRenamedToMutinynet(
      payload.activeArkadeAccountIdByNetwork,
    ),
  }
}

async function adoptLegacySignetNetworkSplitClassification(
  walletDb: Kysely<Database>,
): Promise<HistoricalSignetOnchainChain | null> {
  const legacyChain = parseHistoricalSignetOnchainChain(
    await readSetting(walletDb, LEGACY_SIGNET_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY),
  )
  await walletDb
    .deleteFrom('settings')
    .where('key', 'in', [
      LEGACY_SIGNET_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY,
      LEGACY_SIGNET_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY,
    ])
    .execute()
  return legacyChain
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

function moveSignetNetworkToMutinynet<Row extends { network: string }>(row: Row): Row {
  return row.network === 'signet' ? ({ ...row, network: 'mutinynet' } as Row) : row
}

function moveSignetNetworkModeToMutinynet<Row extends { networkMode: string }>(row: Row): Row {
  return row.networkMode === 'signet' ? ({ ...row, networkMode: 'mutinynet' } as Row) : row
}

function copyWithSignetKeyRenamedToMutinynet<Map extends Record<string, unknown>>(
  networkKeyedMap: Map,
): Map {
  const renamedMap = { ...networkKeyedMap }
  renameSignetMapKeyToMutinynet(renamedMap)
  return renamedMap
}

function hasLegacySignetNetworkSplitAppliedFlag(payload: WalletSecretsPayload): boolean {
  const payloadFields: Record<string, unknown> = { ...payload }
  return payloadFields[LEGACY_SIGNET_NETWORK_SPLIT_APPLIED_FIELD] === true
}

function withoutLegacySignetNetworkSplitAppliedFlag(
  payload: WalletSecretsPayload,
): WalletSecretsPayload {
  const withoutFlag: Record<string, unknown> = { ...payload }
  delete withoutFlag[LEGACY_SIGNET_NETWORK_SPLIT_APPLIED_FIELD]
  return withoutFlag as unknown as WalletSecretsPayload
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
