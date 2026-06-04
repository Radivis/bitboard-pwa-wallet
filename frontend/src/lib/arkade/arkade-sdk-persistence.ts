import { getDatabase } from '@/db/database'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { findStoredArkadeWallet } from '@/lib/arkade/arkade-wallet-secrets'
import { ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES } from '@/lib/arkade/arkade-sdk-persistence-types'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

export function assertSdkPersistenceJsonWithinSizeLimit(sdkPersistenceJson: string): void {
  const byteLength = new TextEncoder().encode(sdkPersistenceJson).byteLength
  if (byteLength > ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES) {
    throw new Error(
      `Arkade SDK persistence exceeds ${ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES} bytes`,
    )
  }
}

export async function loadSdkPersistenceJsonForNetwork(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<string | undefined> {
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    params.password,
    params.walletId,
  )
  return findStoredArkadeWallet(payload, params.networkMode)?.sdkPersistenceJson
}

export async function saveSdkPersistenceJsonForNetwork(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  sdkPersistenceJson: string
}): Promise<void> {
  const { password, walletId, networkMode, sdkPersistenceJson } = params
  assertSdkPersistenceJsonWithinSizeLimit(sdkPersistenceJson)

  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    password,
    transform: async (payload): Promise<WalletSecretsPayload> => {
      const existing = findStoredArkadeWallet(payload, networkMode)
      const now = new Date().toISOString()
      const merged = {
        networkMode,
        createdAt: existing?.createdAt ?? now,
        arkadeAddress: existing?.arkadeAddress,
        lastSessionOpenedAt: existing?.lastSessionOpenedAt,
        sdkPersistenceJson,
      }
      const others = payload.arkadeWallets.filter(
        (row) => row.networkMode !== networkMode,
      )
      return {
        ...payload,
        arkadeWallets: [...others, merged],
      }
    },
  })
}
