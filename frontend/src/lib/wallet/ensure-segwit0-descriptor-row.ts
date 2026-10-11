import {
  ensureSchemaMigrated,
  getDatabase,
  getWalletSecretsEncrypted,
  loadWalletSecretsPayload,
} from '@/db'
import {
  BUMPER_ACCOUNT_ID,
  BUMPER_ADDRESS_TYPE,
} from '@/lib/wallet/bumper-segwit0-policy'
import {
  findDescriptorWallet,
  persistDescriptorWalletRowIfMissing,
} from '@/lib/wallet/descriptor-wallet-manager'
import type { BitcoinNetwork, DescriptorWalletData } from '@/lib/wallet/wallet-domain-types'
import { ensureSecretsChannel } from '@/workers/secrets-channel'

/** Ensure `(network, segwit, 0)` exists without replacing crypto ACTIVE_WALLET. */
export async function ensureSegwit0DescriptorRow(params: {
  walletId: number
  network: BitcoinNetwork
}): Promise<DescriptorWalletData> {
  const { walletId, network } = params
  await ensureSchemaMigrated()
  await ensureSecretsChannel()
  const walletDb = getDatabase()
  const secretsPayload = await loadWalletSecretsPayload(walletDb, walletId)
  const existing = findDescriptorWallet({
    secretsPayload,
    network,
    addressType: BUMPER_ADDRESS_TYPE,
    accountId: BUMPER_ACCOUNT_ID,
  })
  if (existing) {
    return existing
  }

  const encryptedBlobs = await getWalletSecretsEncrypted(walletDb, walletId)
  return persistDescriptorWalletRowIfMissing({
    walletDb,
    walletId,
    encryptedMnemonic: encryptedBlobs.mnemonic,
    targetNetwork: network,
    targetAddressType: BUMPER_ADDRESS_TYPE,
    targetAccountId: BUMPER_ACCOUNT_ID,
  })
}
