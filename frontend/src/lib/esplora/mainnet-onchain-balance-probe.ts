import { getDatabase } from '@/db/database'
import { loadWalletSecretsPayload } from '@/db/wallet-persistence'
import { updateDescriptorWalletChangeset } from '@/lib/wallet/descriptor-wallet-manager'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { isBenignNoActiveWalletError } from '@/lib/shared/wasm-crypto-error'
import { withPersistedChainMismatchRetry } from '@/lib/wallet/persisted-chain-mismatch'
import {
  loadDescriptorWalletWithoutSync,
} from '@/lib/wallet/wallet-utils'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Probe could not read a trustworthy mainnet balance (e.g. persisted chain mismatch
 * recovered via empty chain). Destructive flows must not treat this as zero balance.
 */
export class MainnetBalanceProbeUnverifiableError extends Error {
  constructor() {
    super(
      'Could not verify mainnet on-chain balance because persisted wallet data does not match the expected network. Repair or sync this wallet before continuing.',
    )
    this.name = 'MainnetBalanceProbeUnverifiableError'
  }
}

/**
 * Sums BDK-reported on-chain balance for every mainnet (`bitcoin`) descriptor sub-wallet.
 * Uses ephemeral WASM wallet sessions in the probe loop so the global active wallet slot
 * is not overwritten per descriptor. Restores the committed sub-wallet view afterward.
 * Ignores Lightning / NWC entirely.
 *
 * **Side effect:** After restoring the active sub-wallet, updates `useWalletStore` with the
 * current balance and transaction list from WASM so the UI does not show stale data from the
 * probe loop. Treat this as “probe + refresh active wallet view,” not a pure read.
 *
 * If loading mainnet wallets throws, still attempts to reload the committed sub-wallet and
 * refresh store balance/transactions so the WASM slot is not left on an arbitrary network.
 */
export async function sumMainnetOnChainSatsForWallet(params: {
  password: string
  walletId: number
}): Promise<number> {
  const { password, walletId } = params
  const walletDb = getDatabase()
  const payload = await loadWalletSecretsPayload(walletDb, password, walletId)
  const mainnetDescriptors = payload.descriptorWallets
    .filter((descriptorWallet) => descriptorWallet.network === 'bitcoin')
  if (mainnetDescriptors.length === 0) {
    return 0
  }

  const { loadedSubWallet, networkMode, addressType, accountId } = useWalletStore.getState()
  const committedSubWallet = loadedSubWallet ?? { networkMode, addressType, accountId }

  const {
    openWalletSession,
    exportChangeset,
    getBalance,
    getTransactionList,
  } = useCryptoStore.getState()

  const restoreActiveSubWalletView = async (): Promise<void> => {
    await loadDescriptorWalletWithoutSync({
      password,
      walletId,
      networkMode: committedSubWallet.networkMode,
      addressType: committedSubWallet.addressType,
      accountId: committedSubWallet.accountId,
    })
    const restoredBalance = await getBalance()
    const restoredTxs = await getTransactionList()
    useWalletStore.getState().setBalance(restoredBalance)
    useWalletStore.getState().setTransactions(restoredTxs)
  }

  let balanceSum = 0
  try {
    try {
      const currentChangeset = await exportChangeset()
      await updateDescriptorWalletChangeset({
        password,
        walletId,
        network: toBitcoinNetwork(committedSubWallet.networkMode),
        addressType: committedSubWallet.addressType,
        accountId: committedSubWallet.accountId,
        changesetJson: currentChangeset,
      })
    } catch (err) {
      if (!isBenignNoActiveWalletError(err)) {
        throw err
      }
    }

    for (const descriptorWalletData of mainnetDescriptors) {
      const { result: session, usedEmptyChainFallback } =
        await withPersistedChainMismatchRetry(openWalletSession, {
          externalDescriptor: descriptorWalletData.externalDescriptor,
          internalDescriptor: descriptorWalletData.internalDescriptor,
          network: 'bitcoin',
          changesetJson: descriptorWalletData.changeSet,
          useEmptyChain: false,
        })
      try {
        if (usedEmptyChainFallback) {
          throw new MainnetBalanceProbeUnverifiableError()
        }
        const balance = await session.getBalance()
        balanceSum += balance.total
      } finally {
        session.free()
      }
    }
  } catch (probeErr) {
    try {
      await restoreActiveSubWalletView()
    } catch (restoreErr) {
      if (import.meta.env.DEV) {
        console.error(
          '[mainnet-onchain-balance-probe] Failed to restore wallet view after probe error',
          restoreErr,
        )
      }
    }
    throw probeErr
  }

  await restoreActiveSubWalletView()
  return balanceSum
}

export type MainnetPositiveWalletRow = {
  walletId: number
  /** Display name from the wallets table */
  name: string
  /** Sum of on-chain mainnet sats for that wallet (BDK-reported; Lightning not included). */
  totalSats: number
}

/**
 * Probes each wallet in order; same side effects per call as {@link sumMainnetOnChainSatsForWallet}.
 * Returns only wallets with a positive mainnet on-chain total.
 */
export async function listWalletsWithPositiveMainnetOnChainBalance(params: {
  password: string
  wallets: { wallet_id: number; name: string }[]
}): Promise<MainnetPositiveWalletRow[]> {
  const { password, wallets } = params
  const rows: MainnetPositiveWalletRow[] = []
  for (const w of wallets) {
    const totalSats = await sumMainnetOnChainSatsForWallet({
      password,
      walletId: w.wallet_id,
    })
    if (totalSats > 0) {
      const trimmed = w.name.trim()
      rows.push({
        walletId: w.wallet_id,
        name: trimmed.length > 0 ? trimmed : `Wallet ${w.wallet_id}`,
        totalSats,
      })
    }
  }
  return rows
}
