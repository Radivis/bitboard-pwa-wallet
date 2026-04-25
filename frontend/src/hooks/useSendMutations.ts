import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useSendStore } from '@/stores/sendStore'
import { getEsploraUrl, toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { updateWalletChangeset, loadCustomEsploraUrl } from '@/lib/wallet-utils'
import { walletLabOwner } from '@/lib/lab-owner'
import { labBitcoinAddressesEqual } from '@/lib/lab-utils'
import { getLabWorker, initLabWorkerWithState } from '@/workers/lab-factory'
import { runLabOp } from '@/lib/lab-coordinator'
import { labOpAddSignedTransaction } from '@/lib/lab-worker-operations'
import { setLabChainStateCache } from '@/hooks/useLabChainStateQuery'
import { invalidateLabPaginatedQueries } from '@/lib/lab-paginated-queries'
import { errorMessage } from '@/lib/utils'
import { formatAmountInputFromSats, UX_DUST_FLOOR_SATS } from '@/lib/bitcoin-dust'

/**
 * Mutation to prepare a PSBT (mainnet/testnet/signet/regtest).
 * Caller handles change-free modal then `applyChangeFreeBump: true` when the user opts in.
 */
export function useBuildTransactionMutation() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const prepareOnchainSendTransaction = useCryptoStore(
    (s) => s.prepareOnchainSendTransaction,
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
        recipientAddress: params.normalizedRecipient,
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
  const networkMode = useWalletStore((s) => s.networkMode)
  const psbt = useSendStore((s) => s.psbt)
  const reset = useSendStore((s) => s.reset)

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
        const changeset = await exportChangeset()
        await updateWalletChangeset({
          password,
          walletId: activeWalletId,
          changesetJson: changeset,
        })
      }

      void (async () => {
        setWalletStatus('syncing')
        try {
          await syncWallet(esploraUrl)
          const newBalance = await getBalance()
          const newTxs = await getTransactionList()
          setBalance(newBalance)
          setTransactions(newTxs)
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
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const getLabChangeAddress = useCryptoStore((s) => s.getLabChangeAddress)
  const buildAndSignLabTransaction = useCryptoStore((s) => s.buildAndSignLabTransaction)
  const reset = useSendStore((s) => s.reset)

  return useMutation({
    mutationFn: async (params: {
      normalizedRecipient: string
      amountSats: number
      effectiveFeeRate: number
      applyChangeFreeBump?: boolean
    }) => {
      if (activeWalletId == null) throw new Error('No active wallet')

      const { signedTxHex, fullMetadata } = await runLabOp(async () => {
        await initLabWorkerWithState()
        const labWorker = getLabWorker()
        const walletChangeAddress = await getLabChangeAddress()

        const knownRecipientOwner =
          currentAddress != null &&
          labBitcoinAddressesEqual(params.normalizedRecipient, currentAddress)
            ? walletLabOwner(activeWalletId)
            : undefined

        const { utxosJson, mempoolMetadata, totalInput } =
          await labWorker.prepareLabWalletTransaction({
            walletId: activeWalletId,
            toAddress: params.normalizedRecipient,
            amountSats: params.amountSats,
            feeRateSatPerVb: params.effectiveFeeRate,
            walletChangeAddress,
            knownRecipientOwner,
          })

        const lab = await buildAndSignLabTransaction({
          utxosJson,
          toAddress: params.normalizedRecipient,
          amountSats: params.amountSats,
          feeRateSatPerVb: params.effectiveFeeRate,
          changeAddress: walletChangeAddress,
          applyChangeFreeBump: params.applyChangeFreeBump ?? false,
        })
        const {
          signedTxHex,
          feeSats,
          hasChange,
          finalAmountSats,
          raisedToMinDust,
          bumpedChangeFree,
        } = lab

        const { amountUnit } = useSendStore.getState()
        if (raisedToMinDust || bumpedChangeFree) {
          const lines: string[] = []
          if (raisedToMinDust) {
            lines.push(
              `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`,
            )
          }
          if (bumpedChangeFree) {
            lines.push(
              'Change for this transaction would have been below the dust limit; the amount was increased to make the transfer change-free.',
            )
          }
          toast.warning(lines.join(' '))
          useSendStore.setState({
            amount: formatAmountInputFromSats(finalAmountSats, amountUnit),
            onchainDustWarning: {
              previousSats: lab.originalAmountSats,
              raisedToDustMin: raisedToMinDust,
              bumpedChangeFree,
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

        const fullMetadata = {
          ...mempoolMetadata,
          feeSats,
          hasChange,
          outputsDetail,
        }

        return { signedTxHex, fullMetadata }
      })

      return labOpAddSignedTransaction(signedTxHex, fullMetadata)
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
