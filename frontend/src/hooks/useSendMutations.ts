import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useSendStore } from '@/stores/sendStore'
import { getEsploraUrl, toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { updateWalletChangeset, loadCustomEsploraUrl } from '@/lib/wallet/wallet-utils'
import { walletLabOwner } from '@/lib/lab/lab-owner'
import { labBitcoinAddressesEqual } from '@/lib/lab/lab-utils'
import { getLabWorker, initLabWorkerWithState } from '@/workers/lab-factory'
import { runLabOp } from '@/lib/lab/lab-coordinator'
import { labOpAddSignedTransaction } from '@/lib/lab/lab-worker-operations'
import { setLabChainStateCache } from '@/hooks/useLabChainStateQuery'
import { invalidateLabPaginatedQueries } from '@/lib/lab/lab-paginated-queries'
import { errorMessage } from '@/lib/shared/utils'
import { formatAmountInputFromSats } from '@/lib/wallet/bitcoin-dust'
import { onchainDustPrepareWarningLines } from '@/lib/wallet/send/onchain-dust-prepare-messages'

/**
 * Mutation to prepare a PSBT (mainnet/testnet/signet/regtest).
 * Caller handles change-free modal then `applyChangeFreeBump: true` when the user opts in.
 */
export function useBuildTransactionMutation() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const prepareOnchainSendTransaction = useCryptoStore(
    (cryptoState) => cryptoState.prepareOnchainSendTransaction,
  )

  return useMutation({
    mutationFn: async (params: {
      normalizedRecipient: string
      amountSats: number
      effectiveFeeRate: number
      applyChangeFreeBump?: boolean
    }) => {
      const network = toBitcoinNetwork(networkMode)
      return prepareOnchainSendTransaction({
        toAddress: params.normalizedRecipient,
        amountSats: params.amountSats,
        feeRateSatPerVb: params.effectiveFeeRate,
        network,
        applyChangeFreeBump: params.applyChangeFreeBump ?? false,
      })
    },
    onError: (err) => {
      console.error('Build transaction failed:', err)
      toast.error(errorMessage(err) || 'Failed to build transaction')
    },
  })
}

/**
 * Mutation to broadcast a transaction (mainnet/testnet/signet/regtest).
 * Signs and extracts from PSBT, broadcasts via Esplora, persists the changeset, then returns
 * so `onSuccess` can reset UI and navigate. Post-broadcast `syncWallet` runs in the
 * background so the user is not blocked on a full sync before leaving the send flow.
 */
export function useBroadcastTransactionMutation() {
  const navigate = useNavigate()
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const psbt = useSendStore((sendState) => sendState.psbt)
  const reset = useSendStore((sendState) => sendState.reset)

  return useMutation({
    mutationFn: async () => {
      if (!psbt) throw new Error('No PSBT to broadcast')

      const {
        signAndExtractTransaction,
        broadcastTransaction,
        exportChangeset,
        syncWallet,
        getBalance,
        getTransactionList,
      } = useCryptoStore.getState()
      const { setWalletStatus, setBalance, setTransactions, setLastSyncTime } =
        useWalletStore.getState()
      const password = useSessionStore.getState().password
      const activeWalletId = useWalletStore.getState().activeWalletId

      const rawTxHex = await signAndExtractTransaction(psbt)

      const customUrl = await loadCustomEsploraUrl(networkMode)
      const esploraUrl = getEsploraUrl(networkMode, customUrl)
      const txid = await broadcastTransaction(rawTxHex, esploraUrl)

      if (password && activeWalletId) {
        const changesetJson = await exportChangeset()
        await updateWalletChangeset({
          password,
          walletId: activeWalletId,
          changesetJson,
        })
      }

      void (async () => {
        setWalletStatus('syncing')
        try {
          await syncWallet(esploraUrl)
          const newBalance = await getBalance()
          const newTransactionList = await getTransactionList()
          setBalance(newBalance)
          setTransactions(newTransactionList)
          setLastSyncTime(new Date())
        } catch {
          // keep unlocked on sync failure
        }
        setWalletStatus('unlocked')
      })()

      return { txid }
    },
    onSuccess: ({ txid }) => {
      toast.success(`Transaction broadcast! TXID: ${txid.slice(0, 16)}...`)
      reset()
      navigate({ to: '/wallet' })
    },
    onError: (err) => {
      toast.error(`Broadcast failed: ${errorMessage(err)}`)
    },
  })
}

/**
 * Mutation to build, sign, and add a lab transaction to the mempool.
 * Uses lab worker and crypto worker.
 */
export function useLabSendMutation() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const getLabChangeAddress = useCryptoStore((cryptoState) => cryptoState.getLabChangeAddress)
  const buildAndSignLabTransaction = useCryptoStore((cryptoState) => cryptoState.buildAndSignLabTransaction)
  const reset = useSendStore((sendState) => sendState.reset)

  return useMutation({
    mutationFn: async ({
      normalizedRecipient,
      amountSats,
      effectiveFeeRate,
      applyChangeFreeBump,
    }: {
      normalizedRecipient: string
      amountSats: number
      effectiveFeeRate: number
      applyChangeFreeBump?: boolean
    }) => {
      if (activeWalletId == null) throw new Error('No active wallet')

      const { signedTxHex, labMempoolTransactionMetadata } = await runLabOp(async () => {
        await initLabWorkerWithState()
        const labWorker = getLabWorker()
        const walletChangeAddress = await getLabChangeAddress()

        const knownRecipientOwner =
          currentAddress != null &&
          labBitcoinAddressesEqual(normalizedRecipient, currentAddress)
            ? walletLabOwner(activeWalletId)
            : undefined

        const { utxosJson, mempoolMetadata, totalInput } =
          await labWorker.prepareLabWalletTransaction({
            walletId: activeWalletId,
            toAddress: normalizedRecipient,
            amountSats,
            feeRateSatPerVb: effectiveFeeRate,
            walletChangeAddress,
            knownRecipientOwner,
          })

        const signedLabTransaction = await buildAndSignLabTransaction({
          utxosJson,
          toAddress: normalizedRecipient,
          amountSats,
          feeRateSatPerVb: effectiveFeeRate,
          changeAddress: walletChangeAddress,
          applyChangeFreeBump: applyChangeFreeBump ?? false,
        })
        const {
          signedTxHex,
          feeSats,
          hasChange,
          finalAmountSats,
          isRaisedToMinDust,
          isBumpedChangeFree,
        } = signedLabTransaction

        const { amountUnit } = useSendStore.getState()
        if (isRaisedToMinDust || isBumpedChangeFree) {
          toast.warning(
            onchainDustPrepareWarningLines({
              isRaisedToMinDust,
              isBumpedChangeFree,
            }).join(' '),
          )
          useSendStore.setState({
            amount: formatAmountInputFromSats(finalAmountSats, amountUnit),
            onchainDustWarning: {
              previousSats: signedLabTransaction.originalAmountSats,
              isRaisedToMinDust,
              isBumpedChangeFree,
            },
          })
        }

        const outputsDetail = hasChange
          ? [
              {
                ...mempoolMetadata.outputsDetail[0],
                amountSats: finalAmountSats,
              },
              {
                address: walletChangeAddress,
                amountSats: totalInput - finalAmountSats - feeSats,
                isChange: true as const,
                owner: mempoolMetadata.sender,
              },
            ]
          : [
              {
                ...mempoolMetadata.outputsDetail[0],
                amountSats: totalInput - feeSats,
              },
            ]

        const labMempoolTransactionMetadata = {
          ...mempoolMetadata,
          feeSats,
          hasChange,
          outputsDetail,
        }

        return { signedTxHex, labMempoolTransactionMetadata }
      })

      return labOpAddSignedTransaction(signedTxHex, labMempoolTransactionMetadata)
    },
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      void invalidateLabPaginatedQueries(queryClient)
      toast.success('Transaction added to mempool')
      reset()
      navigate({ to: '/wallet' })
    },
    onError: (err) => {
      console.error('Lab send failed:', err)
      toast.error(`Lab send failed: ${errorMessage(err)}`)
    },
  })
}
