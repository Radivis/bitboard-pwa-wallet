import { proxy, type Remote } from 'comlink'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import {
  parseWalletPayloadJson,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import type { SecretsChannelService } from '@/workers/secrets-channel-types'

export type WorkerWalletPayloadDeps = {
  secretsProxy: Remote<SecretsChannelService> | SecretsChannelService
  encryptedHost: Remote<EncryptedWalletSecretsHost> | EncryptedWalletSecretsHost
}

/**
 * Applies `applyChange` to the current wallet payload and writes it back, all inside the
 * host's critical section. On a revision conflict `applyChange` runs again on the newer
 * payload, so it must be a pure merge. Returns the payload that was written.
 */
export async function updateDecryptedWalletPayload(
  deps: WorkerWalletPayloadDeps,
  walletId: number,
  applyChange: (payload: WalletSecretsPayload) => WalletSecretsPayload,
): Promise<WalletSecretsPayload> {
  let writtenPayload: WalletSecretsPayload | null = null
  await deps.encryptedHost.updateEncryptedPayload(
    walletId,
    proxy(async (currentBlob) => {
      const plaintext = await deps.secretsProxy.decrypt(currentBlob)
      const nextPayload = applyChange(parseWalletPayloadJson(plaintext))
      const encryptedNext = await deps.secretsProxy.encrypt(JSON.stringify(nextPayload))
      writtenPayload = nextPayload
      return encryptedNext
    }),
  )
  if (writtenPayload == null) {
    throw new Error('Wallet payload update finished without writing a payload')
  }
  return writtenPayload
}
