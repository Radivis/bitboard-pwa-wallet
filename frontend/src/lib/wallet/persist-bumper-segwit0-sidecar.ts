import { ensureMigrated, getDatabase, loadWalletSecretsPayload } from '@/db'
import {
  findDescriptorWallet,
  updateDescriptorWalletChangeset,
} from '@/lib/wallet/descriptor-wallet-manager'
import {
  BUMPER_ACCOUNT_ID,
  BUMPER_ADDRESS_TYPE,
  bumperSidecarExportIsNewerThanRow,
  shouldPersistBumperSegwit0Sidecar,
} from '@/lib/wallet/bumper-segwit0-policy'
import type {
  BitcoinNetwork,
  DescriptorWalletData,
} from '@/lib/wallet/wallet-domain-types'

async function loadExistingSegwit0DescriptorRow(params: {
  walletId: number
  network: BitcoinNetwork
}): Promise<DescriptorWalletData | undefined> {
  await ensureMigrated()
  const secretsPayload = await loadWalletSecretsPayload(getDatabase(), params.walletId)
  return findDescriptorWallet({
    secretsPayload,
    network: params.network,
    addressType: BUMPER_ADDRESS_TYPE,
    accountId: BUMPER_ACCOUNT_ID,
  })
}

export async function persistBumperSegwit0SidecarIfAllowed(params: {
  walletId: number
  network: BitcoinNetwork
  changesetJson: string
  markFullScanDone: boolean
  lastSuccessfulEsploraSyncAt?: string
  loadedAddressType: string | null
  loadedAccountId: number | null
}): Promise<boolean> {
  if (
    !shouldPersistBumperSegwit0Sidecar({
      loadedAddressType: params.loadedAddressType,
      loadedAccountId: params.loadedAccountId,
    })
  ) {
    return false
  }

  const existingRow = await loadExistingSegwit0DescriptorRow({
    walletId: params.walletId,
    network: params.network,
  })
  if (
    existingRow != null &&
    !bumperSidecarExportIsNewerThanRow({
      exportSyncedAt: params.lastSuccessfulEsploraSyncAt,
      exportChangesetJson: params.changesetJson,
      rowLastSuccessfulEsploraSyncAt: existingRow.lastSuccessfulEsploraSyncAt,
      rowChangesetJson: existingRow.changeSet,
    })
  ) {
    return false
  }

  await updateDescriptorWalletChangeset({
    walletId: params.walletId,
    network: params.network,
    addressType: BUMPER_ADDRESS_TYPE,
    accountId: BUMPER_ACCOUNT_ID,
    changesetJson: params.changesetJson,
    markFullScanDone: params.markFullScanDone,
    lastSuccessfulEsploraSyncAt: params.lastSuccessfulEsploraSyncAt,
  })
  return true
}
