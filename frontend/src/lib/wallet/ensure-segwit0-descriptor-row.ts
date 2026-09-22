import {
  ensureMigrated,
  getDatabase,
  getWalletSecretsEncrypted,
  loadWalletSecretsPayload,
  updateWalletSecretsEncryptedPayloadWithRetry,
} from '@/db'
import { findDescriptorWallet } from '@/lib/wallet/descriptor-wallet-manager'
import { AddressType } from '@/lib/wallet/wallet-domain-types'
import type { BitcoinNetwork, DescriptorWalletData } from '@/lib/wallet/wallet-domain-types'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import type { EncryptedBlobForDb } from '@/workers/crypto-api'
import { useCryptoStore } from '@/stores/cryptoStore'

function workerBlobToPersistence(blob: EncryptedBlobForDb) {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfPhc: blob.kdfPhc,
  }
}

/** Ensure `(network, segwit, 0)` exists without replacing crypto ACTIVE_WALLET. */
export async function ensureSegwit0DescriptorRow(params: {
  walletId: number
  network: BitcoinNetwork
}): Promise<DescriptorWalletData> {
  const { walletId, network } = params
  await ensureMigrated()
  await ensureSecretsChannel()
  const walletDb = getDatabase()
  const secretsPayload = await loadWalletSecretsPayload(walletDb, walletId)
  const existing = findDescriptorWallet({
    secretsPayload,
    network,
    addressType: AddressType.SegWit,
    accountId: 0,
  })
  if (existing) {
    return existing
  }

  const encryptedBlobs = await getWalletSecretsEncrypted(walletDb, walletId)
  const { createDescriptorWalletRowIfMissing } = useCryptoStore.getState()
  const createRowResponse = await createDescriptorWalletRowIfMissing({
    encryptedPayload: encryptedBlobs.payload,
    encryptedMnemonic: encryptedBlobs.mnemonic,
    targetNetwork: network,
    targetAddressType: AddressType.SegWit,
    targetAccountId: 0,
  })
  if (createRowResponse.encryptedMnemonicToStore !== null) {
    throw new Error(
      'createDescriptorWalletRowIfMissing returned mnemonic update, which is unsupported in payload-only CAS writes',
    )
  }
  const encryptedPayloadToStore = createRowResponse.encryptedPayloadToStore
  if (encryptedPayloadToStore !== null) {
    await updateWalletSecretsEncryptedPayloadWithRetry({
      walletDb,
      walletId,
      transform: async () => workerBlobToPersistence(encryptedPayloadToStore),
    })
  }
  return createRowResponse.descriptorWalletData
}
