import { getDatabase, ensureMigrated } from '@/db/database'
import type { NetworkMode } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { updateDescriptorWalletChangeset } from '@/lib/descriptor-wallet-manager'

/**
 * Update the changeset of the currently active descriptor wallet.
 * Reads (networkMode, addressType, accountId) from the wallet store.
 */
export async function updateWalletChangeset(
  password: string,
  walletId: number,
  changesetJson: string,
): Promise<void> {
  const { networkMode, addressType, accountId } = useWalletStore.getState()
  const network = toBitcoinNetwork(networkMode)
  await updateDescriptorWalletChangeset(
    password,
    walletId,
    network,
    addressType,
    accountId,
    changesetJson,
  )
}

export function getWalletInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export async function saveCustomEsploraUrl(
  network: NetworkMode,
  url: string,
): Promise<void> {
  await ensureMigrated()
  const db = getDatabase()
  const key = `custom_esplora_url_${network}`

  const existing = await db
    .selectFrom('settings')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst()

  if (existing) {
    await db
      .updateTable('settings')
      .set({ value: url })
      .where('key', '=', key)
      .execute()
  } else {
    await db.insertInto('settings').values({ key, value: url }).execute()
  }
}

export async function deleteCustomEsploraUrl(
  network: NetworkMode,
): Promise<void> {
  await ensureMigrated()
  const db = getDatabase()
  await db
    .deleteFrom('settings')
    .where('key', '=', `custom_esplora_url_${network}`)
    .execute()
}

export async function loadCustomEsploraUrl(
  network: NetworkMode,
): Promise<string | null> {
  await ensureMigrated()
  const db = getDatabase()
  const result = await db
    .selectFrom('settings')
    .select('value')
    .where('key', '=', `custom_esplora_url_${network}`)
    .executeTakeFirst()

  return result?.value ?? null
}
