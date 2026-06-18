import { getDatabase } from '@/db/database'
import { loadWalletSecretsPayload } from '@/db/wallet-persistence'
import type { DescriptorWalletData } from '@/db/wallet-persistence'
import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { withPersistedChainMismatchRetry } from '@/lib/wallet/persisted-chain-mismatch'
import { appQueryClient } from '@/lib/shared/app-query-client'
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

function walletDisplayName(walletRow: { walletId: number; name: string }): string {
  const trimmed = walletRow.name.trim()
  return trimmed.length > 0 ? trimmed : `Wallet ${walletRow.walletId}`
}

/**
 * Avoid CAS races with background Esplora sync / bootstrap before a read-only probe.
 * Ephemeral wallet sessions do not mutate the global WASM slot, so we must not persist
 * changesets here (that collides with `persistPostEsploraSyncDescriptorWalletState`).
 */
export async function prepareMainnetBalanceProbePreflight(): Promise<void> {
  await appQueryClient.cancelQueries()
  await awaitInFlightWalletSecretsWrites()
}

async function sumMainnetOnChainSatsFromDescriptorWallets(
  mainnetDescriptors: DescriptorWalletData[],
): Promise<number> {
  if (mainnetDescriptors.length === 0) {
    return 0
  }

  const { openWalletSession } = useCryptoStore.getState()
  let balanceSum = 0

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
      balanceSum += balance.totalSats
    } finally {
      session.free()
    }
  }

  return balanceSum
}

function assertActiveWalletLoadedForProbe(): void {
  const { activeWalletId } = useWalletStore.getState()
  if (activeWalletId == null) {
    throw new Error('No active wallet loaded for mainnet balance probe')
  }
}

/**
 * Sums BDK-reported on-chain balance for every mainnet (`bitcoin`) descriptor wallet.
 * Uses ephemeral WASM wallet sessions so the global active wallet slot is not overwritten.
 * Ignores Lightning / NWC entirely.
 */
export async function sumMainnetOnChainSatsForWallet(params: {
  walletId: number
}): Promise<number> {
  const { walletId } = params
  assertActiveWalletLoadedForProbe()
  await prepareMainnetBalanceProbePreflight()

  const walletDb = getDatabase()
  const payload = await loadWalletSecretsPayload(walletDb, walletId)
  const mainnetDescriptors = payload.descriptorWallets.filter(
    (descriptorWallet) => descriptorWallet.network === 'bitcoin',
  )

  return sumMainnetOnChainSatsFromDescriptorWallets(mainnetDescriptors)
}

export type MainnetPositiveWalletRow = {
  walletId: number
  /** Display name from the wallets table */
  name: string
  /** Sum of on-chain mainnet sats for that wallet (BDK-reported; Lightning not included). */
  totalSats: number
}

export type MainnetBalanceProbeSummary = {
  positiveBalanceRows: MainnetPositiveWalletRow[]
  /** Wallets whose mainnet balance could not be verified (e.g. corrupted persisted changeset). */
  unverifiableWalletNames: string[]
}

/**
 * Probes each wallet in order using ephemeral sessions only (read-only; no secrets CAS writes).
 */
export async function listWalletsWithPositiveMainnetOnChainBalance(params: {
  wallets: { walletId: number; name: string }[]
}): Promise<MainnetBalanceProbeSummary> {
  const { wallets } = params
  assertActiveWalletLoadedForProbe()
  await prepareMainnetBalanceProbePreflight()

  const walletDb = getDatabase()
  const positiveBalanceRows: MainnetPositiveWalletRow[] = []
  const unverifiableWalletNames: string[] = []

  for (const walletRow of wallets) {
    try {
      const payload = await loadWalletSecretsPayload(
        walletDb,
        walletRow.walletId,
      )
      const mainnetDescriptors = payload.descriptorWallets.filter(
        (descriptorWallet) => descriptorWallet.network === 'bitcoin',
      )
      const totalSats = await sumMainnetOnChainSatsFromDescriptorWallets(
        mainnetDescriptors,
      )
      if (totalSats > 0) {
        positiveBalanceRows.push({
          walletId: walletRow.walletId,
          name: walletDisplayName(walletRow),
          totalSats,
        })
      }
    } catch (err) {
      if (err instanceof MainnetBalanceProbeUnverifiableError) {
        unverifiableWalletNames.push(walletDisplayName(walletRow))
        continue
      }
      throw err
    }
  }

  return { positiveBalanceRows, unverifiableWalletNames }
}
