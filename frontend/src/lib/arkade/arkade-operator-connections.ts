import {
  getArkadeEndpoints,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import {
  ensureArkadeOperatorConnectionEncrypted,
  findActiveArkadeConnectionSummary,
  listArkadeConnectionSummaries,
} from '@/lib/arkade/arkade-encrypted-persistence-manager'
import type { ArkadeOperatorConnectionSummary } from '@/lib/arkade/arkade-payload-merge'
import {
  assertOperatorSignerMatches,
  defaultArkadeOperatorLabel,
  findArkadeOperatorConnection,
  findActiveArkadeOperatorConnection,
} from '@/lib/arkade/arkade-payload-merge'
import type {
  StoredArkadeOperatorConnection,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import { getDatabase, getWalletSecretsEncrypted } from '@/db'

export {
  assertOperatorSignerMatches,
  defaultArkadeOperatorLabel,
  findArkadeOperatorConnection,
  findActiveArkadeOperatorConnection,
}

export type { ArkadeOperatorConnectionSummary }

export { findActiveArkadeConnectionSummary } from '@/lib/arkade/arkade-encrypted-persistence-manager'

export async function loadArkadeConnectionsForWallet(params: {
  walletId: number
}): Promise<ArkadeOperatorConnectionSummary[]> {
  return listArkadeConnectionSummaries(params)
}

export async function loadActiveArkadeConnectionForNetwork(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<ArkadeOperatorConnectionSummary | undefined> {
  const encrypted = await getWalletSecretsEncrypted(getDatabase(), params.walletId)
  return findActiveArkadeConnectionSummary({
    walletId: params.walletId,
    networkMode: params.networkMode,
    encryptedPayload: encrypted.payload,
  })
}

export async function ensureArkadeOperatorConnection(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  operatorSignerPkHex: string
  operatorUrl: string
  delegatorUrl: string
  connectionId: string
  persistInitialSdkFromWasm?: boolean
}): Promise<ArkadeOperatorConnectionSummary> {
  return ensureArkadeOperatorConnectionEncrypted(params)
}

export function resolveArkadeEndpointsForConnection(
  connection: Pick<StoredArkadeOperatorConnection, 'networkMode' | 'operatorUrl' | 'delegatorUrl'>,
): { arkServerUrl: string; delegatorUrl: string; esploraUrl: string } {
  const defaults = getArkadeEndpoints(connection.networkMode)
  return {
    arkServerUrl: connection.operatorUrl,
    delegatorUrl: connection.delegatorUrl ?? defaults.delegatorUrl,
    esploraUrl: defaults.esploraUrl,
  }
}

/** @deprecated Payload-shaped type for tests; production uses ArkadeOperatorConnectionSummary. */
export type ArkadeOperatorConnectionsPayloadSlice = Pick<
  WalletSecretsPayload,
  'arkadeOperatorConnections' | 'activeArkadeConnectionIdByNetwork'
>
