import { applyOpenedBarkRail } from '@/lib/bark/bark-rail-metadata'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import { parseWalletPayloadJson } from '@/lib/wallet/wallet-domain-types'
import type { Remote } from 'comlink'
import type { SecretsChannelService } from '@/workers/secrets-channel-types'

export type BarkEncryptedPayloadDeps = {
  secretsProxy: Remote<SecretsChannelService> | SecretsChannelService
  encryptedHost: Remote<EncryptedWalletSecretsHost> | EncryptedWalletSecretsHost
}

/**
 * Writes barkRail into the encrypted payload. Does not read or write IndexedDB.
 */
export async function persistOpenedBarkRail(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  fingerprint: string,
): Promise<void> {
  const encryptedPayload = await deps.encryptedHost.readEncryptedPayload(walletId)
  const plaintext = await deps.secretsProxy.decrypt({
    ciphertext: encryptedPayload.ciphertext,
    iv: encryptedPayload.iv,
    salt: encryptedPayload.salt,
    kdfPhc: encryptedPayload.kdfPhc,
  })
  const payload = parseWalletPayloadJson(plaintext)
  const nextPayload = applyOpenedBarkRail({ payload, fingerprint })
  const encryptedNext = await deps.secretsProxy.encrypt(JSON.stringify(nextPayload))
  await deps.encryptedHost.writeEncryptedPayloadCAS(walletId, {
    ciphertext: encryptedNext.ciphertext,
    iv: encryptedNext.iv,
    salt: encryptedNext.salt,
    kdfPhc: encryptedNext.kdfPhc,
  })
}
