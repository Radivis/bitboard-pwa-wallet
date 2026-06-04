import { getDatabase } from '@/db/database'
import { updateWalletSecretsPayloadWithRetry } from '@/db/wallet-persistence'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { findStoredArkadeWallet } from '@/lib/arkade/arkade-wallet-secrets'
import type {
  ArkadeConnectionSnapshot,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

const MAX_ARKADE_PAYMENT_ROWS = 5000

export async function applyArkadeSnapshotPatch(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  snapshot: ArkadeConnectionSnapshot
}): Promise<void> {
  const { password, walletId, networkMode, snapshot } = params
  const payments =
    snapshot.payments.length > MAX_ARKADE_PAYMENT_ROWS
      ? snapshot.payments.slice(0, MAX_ARKADE_PAYMENT_ROWS)
      : snapshot.payments

  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    password,
    transform: async (payload): Promise<WalletSecretsPayload> => {
      const existing = findStoredArkadeWallet(payload, networkMode)
      if (existing == null) {
        throw new Error('Arkade wallet state missing for snapshot patch')
      }
      const merged = {
        ...existing,
        arkadeSnapshot: {
          ...snapshot,
          payments,
        },
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
