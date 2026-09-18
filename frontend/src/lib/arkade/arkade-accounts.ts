import {
  getArkadeEndpoints,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import {
  ensureArkadeAccountEncrypted,
  findActiveArkadeAccountSummary,
  listArkadeAccountSummaries,
} from '@/lib/arkade/arkade-encrypted-persistence-manager'
import type { ArkadeAccountSummary } from '@/lib/arkade/arkade-payload-merge'
import {
  assertOperatorSignerMatches,
  defaultArkadeOperatorLabel,
  findArkadeAccount,
  findActiveArkadeAccount,
} from '@/lib/arkade/arkade-payload-merge'
import type { ArkadeSignerMigrationHint } from '@/workers/arkade-api'
import type {
  StoredArkadeAccount,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import { getDatabase, getWalletSecretsEncrypted } from '@/db'

export {
  assertOperatorSignerMatches,
  defaultArkadeOperatorLabel,
  findArkadeAccount,
  findActiveArkadeAccount,
}

export type { ArkadeAccountSummary }

export { findActiveArkadeAccountSummary } from '@/lib/arkade/arkade-encrypted-persistence-manager'

export async function loadArkadeAccountsForWallet(params: {
  walletId: number
}): Promise<ArkadeAccountSummary[]> {
  return listArkadeAccountSummaries(params)
}

export async function loadActiveArkadeAccountForNetwork(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<ArkadeAccountSummary | undefined> {
  const encrypted = await getWalletSecretsEncrypted(getDatabase(), params.walletId)
  return findActiveArkadeAccountSummary({
    walletId: params.walletId,
    networkMode: params.networkMode,
    encryptedPayload: encrypted.payload,
  })
}

export async function ensureArkadeAccount(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  operatorSignerPkHex: string
  operatorUrl: string
  delegatorUrl: string
  arkadeAccountId: string
  persistInitialSdkFromWasm?: boolean
  signerMigrationHint?: ArkadeSignerMigrationHint
}): Promise<ArkadeAccountSummary> {
  return ensureArkadeAccountEncrypted(params)
}

export function resolveArkadeEndpointsForAccount(
  account: Pick<StoredArkadeAccount, 'networkMode' | 'operatorUrl' | 'delegatorUrl'>,
): { arkServerUrl: string; delegatorUrl: string; esploraUrl: string } {
  const defaults = getArkadeEndpoints(account.networkMode)
  return {
    arkServerUrl: account.operatorUrl,
    delegatorUrl: account.delegatorUrl ?? defaults.delegatorUrl,
    esploraUrl: defaults.esploraUrl,
  }
}

/** @deprecated Payload-shaped type for tests; production uses ArkadeAccountSummary. */
export type ArkadeAccountsPayloadSlice = Pick<
  WalletSecretsPayload,
  'arkadeAccounts' | 'activeArkadeAccountIdByNetwork'
>
