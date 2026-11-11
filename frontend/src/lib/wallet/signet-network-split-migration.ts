import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { ARKADE_OPERATOR_PROXY_PREFIX } from '@/lib/arkade/arkade-operator-proxy'
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
import { descriptorChangesetContradictsNetwork } from '@/lib/wallet/signet-mutinynet-chain-classifier'
import type {
  DescriptorWalletData,
  StoredArkadeAccount,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

/**
 * Before the Signet/Mutinynet split, the Signet slot of this path forwarded to
 * mutinynet.arkade.sh. v0.3.6 pointed the same path at signet.arkade.sh.
 */
const HISTORICAL_SIGNET_OPERATOR_PROXY_PATH = `${ARKADE_OPERATOR_PROXY_PREFIX}/signet`
const MUTINYNET_OPERATOR_PROXY_PATH = `${ARKADE_OPERATOR_PROXY_PREFIX}/mutinynet`

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
 * A same-origin `/api/arkade/operator/signet` URL is rewritten to the Mutinynet
 * proxy path. Any other operator URL is left as stored.
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
    arkadeAccounts: payload.arkadeAccounts.map(moveHistoricalSignetArkadeAccountToMutinynet),
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

function moveHistoricalSignetArkadeAccountToMutinynet(
  account: StoredArkadeAccount,
): StoredArkadeAccount {
  if (account.networkMode !== 'signet') return account
  return {
    ...account,
    networkMode: 'mutinynet',
    operatorUrl: rewriteHistoricalSignetOperatorProxyUrl(account.operatorUrl),
  }
}

/**
 * v0.3.6 moved historical Arkade accounts to Mutinynet and left `operatorUrl`
 * on the Signet proxy path. Wallets that already have the split marker still
 * need that path pointed at Mutinynet. Public Signet accounts are not touched.
 */
export function repairMutinynetArkadeOperatorUrl(
  payload: WalletSecretsPayload,
): WalletSecretsPayload {
  return {
    ...payload,
    arkadeAccounts: payload.arkadeAccounts.map(repairMutinynetAccountOperatorUrl),
  }
}

/**
 * Drops every Signet or Mutinynet descriptor row whose block history belongs to the
 * other chain. Both networks derive identical descriptors, so a dropped row is only
 * a cache: the next load recreates it from the mnemonic with `fullScanDone: false`,
 * and the post-unlock full scan rebuilds it on its own network. Unreadable
 * changesets, other networks, Arkade, Lightning and Bark are left as they are.
 */
export function dropDescriptorWalletsContradictingTheirNetwork(
  payload: WalletSecretsPayload,
): WalletSecretsPayload {
  return {
    ...payload,
    descriptorWallets: payload.descriptorWallets.filter(
      (descriptorWallet) => !descriptorWalletContradictsItsNetwork(descriptorWallet),
    ),
  }
}

function descriptorWalletContradictsItsNetwork(descriptorWallet: DescriptorWalletData): boolean {
  if (descriptorWallet.network !== 'signet' && descriptorWallet.network !== 'mutinynet') {
    return false
  }
  return descriptorChangesetContradictsNetwork(
    descriptorWallet.changeSet,
    descriptorWallet.network,
  )
}

function repairMutinynetAccountOperatorUrl(account: StoredArkadeAccount): StoredArkadeAccount {
  if (account.networkMode !== 'mutinynet') return account
  const operatorUrl = rewriteHistoricalSignetOperatorProxyUrl(account.operatorUrl)
  if (operatorUrl === account.operatorUrl) return account
  return { ...account, operatorUrl }
}

function rewriteHistoricalSignetOperatorProxyUrl(operatorUrl: string): string {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(operatorUrl)
  } catch {
    return operatorUrl
  }
  if (pathnameWithoutTrailingSlash(parsedUrl.pathname) !== HISTORICAL_SIGNET_OPERATOR_PROXY_PATH) {
    return operatorUrl
  }
  parsedUrl.pathname = MUTINYNET_OPERATOR_PROXY_PATH
  return parsedUrl.toString()
}

function pathnameWithoutTrailingSlash(pathname: string): string {
  let normalizedPathname = pathname
  while (normalizedPathname.length > 1 && normalizedPathname.endsWith('/')) {
    normalizedPathname = normalizedPathname.slice(0, -1)
  }
  return normalizedPathname
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
