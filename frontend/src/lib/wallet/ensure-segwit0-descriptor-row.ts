import {
  ensureMigrated,
  getDatabase,
  getWalletSecretsEncrypted,
  loadWalletSecretsPayload,
  updateWalletSecretsEncryptedPayloadWithRetry,
} from '@/db'
import {
  BUMPER_ACCOUNT_ID,
  BUMPER_ADDRESS_TYPE,
} from '@/lib/wallet/bumper-segwit0-policy'
import { findDescriptorWallet } from '@/lib/wallet/descriptor-wallet-manager'
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
    addressType: BUMPER_ADDRESS_TYPE,
    accountId: BUMPER_ACCOUNT_ID,
  })
  if (existing) {
    return existing
  }

  const encryptedBlobs = await getWalletSecretsEncrypted(walletDb, walletId)
  const { createDescriptorWalletRowIfMissing } = useCryptoStore.getState()
  let ensuredRow: DescriptorWalletData | null = null
  await updateWalletSecretsEncryptedPayloadWithRetry({
    walletDb,
    walletId,
    transform: async (currentPayload) => {
      const createRowResponse = await createDescriptorWalletRowIfMissing({
        encryptedPayload: currentPayload,
        encryptedMnemonic: encryptedBlobs.mnemonic,
        targetNetwork: network,
        targetAddressType: BUMPER_ADDRESS_TYPE,
        targetAccountId: BUMPER_ACCOUNT_ID,
      })
      if (createRowResponse.encryptedMnemonicToStore !== null) {
        throw new Error(
          'createDescriptorWalletRowIfMissing returned mnemonic update, which is unsupported in payload-only CAS writes',
        )
      }
      ensuredRow = createRowResponse.descriptorWalletData
      if (createRowResponse.encryptedPayloadToStore !== null) {
        return workerBlobToPersistence(createRowResponse.encryptedPayloadToStore)
      }
      return currentPayload
    },
  })
  if (ensuredRow == null) {
    throw new Error('ensureSegwit0DescriptorRow CAS completed without a SegWit-0 row')
  }
  return ensuredRow
}
