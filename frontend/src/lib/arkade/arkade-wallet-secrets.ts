import { getDatabase } from '@/db/database'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import type {
  ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import type {
  StoredArkadeWalletState,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

export function findStoredArkadeWallet(
  payload: WalletSecretsPayload,
  networkMode: ArkadeSupportedNetworkMode,
): StoredArkadeWalletState | undefined {
  return payload.arkadeWallets.find((row) => row.networkMode === networkMode)
}

export async function loadArkadeWalletStateForNetwork(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<StoredArkadeWalletState | undefined> {
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    params.password,
    params.walletId,
  )
  return findStoredArkadeWallet(payload, params.networkMode)
}

export async function upsertArkadeWalletState(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  patch: Partial<StoredArkadeWalletState> & Pick<StoredArkadeWalletState, 'networkMode'>
}): Promise<StoredArkadeWalletState> {
  const { password, walletId, networkMode, patch } = params
  let saved: StoredArkadeWalletState | undefined

  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    password,
    transform: async (payload): Promise<WalletSecretsPayload> => {
      const existing = findStoredArkadeWallet(payload, networkMode)
      const now = new Date().toISOString()
      const merged: StoredArkadeWalletState = {
        networkMode,
        createdAt: existing?.createdAt ?? now,
        arkadeAddress: patch.arkadeAddress ?? existing?.arkadeAddress,
        lastSessionOpenedAt:
          patch.lastSessionOpenedAt ?? existing?.lastSessionOpenedAt,
        sdkPersistenceJson: patch.sdkPersistenceJson ?? existing?.sdkPersistenceJson,
      }
      const others = payload.arkadeWallets.filter(
        (row) => row.networkMode !== networkMode,
      )
      saved = merged
      return {
        ...payload,
        arkadeWallets: [...others, merged],
      }
    },
  })

  if (saved == null) {
    throw new Error('Failed to persist Arkade wallet state')
  }
  return saved
}
