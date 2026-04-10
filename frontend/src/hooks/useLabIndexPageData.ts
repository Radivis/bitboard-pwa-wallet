import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { selectCommittedAddressType, useWalletStore } from '@/stores/walletStore'
import { useLabMiningStore } from '@/stores/labMiningStore'
import { useWallet, useWallets } from '@/db'
import {
  useLabMineBlocksMutation,
  useLabCreateRandomTransactionsMutation,
  useLabCreateTransactionMutation,
  useLabResetMutation,
} from '@/hooks/useLabMutations'
import { LAB_MAX_BLOCKS_PER_MINE, LAB_MIN_BLOCKS_PER_MINE } from '@/workers/lab-api'
import { LAB_MAX_RANDOM_ENTITY_TRANSACTIONS } from '@/lib/lab-random-limits'
import {
  WALLET_OWNER_PREFIX,
  assertLabAddressOwnerResolved,
  labBitcoinAddressesEqual,
  resolveLabAddressOwnerDisplay,
  walletOwnerKey,
} from '@/lib/lab-utils'

const DEFAULT_LAB_FEE_RATE_SAT_PER_VB = 1
const DEFAULT_RANDOM_TRANSACTION_COUNT = 1

/**
 * Form state, derived lab lists, and TanStack Query mutations for lab section routes.
 */
export function useLabIndexPageData() {
  const { data: labState } = useLabChainStateQuery()
  const blocks = labState?.blocks ?? []
  const addresses = labState?.addresses ?? []
  const addressToOwner = labState?.addressToOwner ?? {}
  const utxos = labState?.utxos ?? []
  const mempool = labState?.mempool ?? []
  const transactions = labState?.transactions ?? []
  const txDetails = labState?.txDetails ?? []

  const blockCount = blocks.length === 0 ? 0 : blocks[blocks.length - 1].height + 1

  const mineCount = useLabMiningStore((s) => s.mineCount)
  const setMineCount = useLabMiningStore((s) => s.setMineCount)
  const ownerType = useLabMiningStore((s) => s.ownerType)
  const setOwnerType = useLabMiningStore((s) => s.setOwnerType)
  const targetAddress = useLabMiningStore((s) => s.targetAddress)
  const setTargetAddress = useLabMiningStore((s) => s.setTargetAddress)
  const ownerName = useLabMiningStore((s) => s.ownerName)
  const setOwnerName = useLabMiningStore((s) => s.setOwnerName)

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const labAddressType = useWalletStore(selectCommittedAddressType)
  const { data: activeWallet } = useWallet(activeWalletId)
  const { data: wallets = [] } = useWallets()

  const [showTxForm, setShowTxForm] = useState(false)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [amountSats, setAmountSats] = useState('')
  const [feeRate, setFeeRate] = useState(String(DEFAULT_LAB_FEE_RATE_SAT_PER_VB))
  const [randomTransactionCount, setRandomTransactionCount] = useState(
    String(DEFAULT_RANDOM_TRANSACTION_COUNT),
  )

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [randomBatchProgress, setRandomBatchProgress] = useState<{
    created: number
    total: number
  } | null>(null)

  const mineMutation = useLabMineBlocksMutation()
  const createTxMutation = useLabCreateTransactionMutation()
  const createRandomTxMutation = useLabCreateRandomTransactionsMutation()
  const resetMutation = useLabResetMutation()

  const getBalanceForAddress = useCallback(
    (address: string) =>
      utxos
        .filter((utxo) => labBitcoinAddressesEqual(utxo.address, address))
        .reduce((sumSats, utxo) => sumSats + utxo.amountSats, 0),
    [utxos],
  )

  const resolveLabAddressOwner = useCallback(
    (address: string) => resolveLabAddressOwnerDisplay(address, addressToOwner, txDetails),
    [addressToOwner, txDetails],
  )

  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Address copied to clipboard')
    } catch {
      toast.error('Failed to copy address')
    }
  }, [])

  const handleSend = useCallback(() => {
    const amount = parseInt(amountSats, 10)
    const fee = parseFloat(feeRate)
    if (isNaN(amount) || amount < 1) {
      toast.error('Enter a valid amount')
      return
    }
    const trimmedFrom = fromAddress.trim()
    if (!trimmedFrom) {
      toast.error('Select a from address')
      return
    }
    if (!toAddress.trim()) {
      toast.error('Enter a to address')
      return
    }
    const entityOwner = resolveLabAddressOwner(trimmedFrom)
    assertLabAddressOwnerResolved(trimmedFrom, entityOwner, 'send from')
    if (entityOwner.startsWith(WALLET_OWNER_PREFIX)) {
      toast.error('Spend from a lab entity address (use Send for your wallet)')
      return
    }
    const trimmedTo = toAddress.trim()
    const knownRecipientOwner =
      activeWalletId != null &&
      currentAddress != null &&
      labBitcoinAddressesEqual(trimmedTo, currentAddress)
        ? walletOwnerKey(activeWalletId)
        : undefined

    void createTxMutation
      .mutateAsync({
        entityName: entityOwner,
        fromAddress: trimmedFrom,
        toAddress: trimmedTo,
        amountSats: amount,
        feeRateSatPerVb: fee,
        knownRecipientOwner,
      })
      .then(() => {
        setShowTxForm(false)
        setFromAddress('')
        setToAddress('')
        setAmountSats('')
      })
      .catch(() => {
        /* error toast from mutation onError */
      })
  }, [
    fromAddress,
    toAddress,
    amountSats,
    feeRate,
    createTxMutation,
    resolveLabAddressOwner,
    activeWalletId,
    currentAddress,
  ])

  const handleMine = useCallback(() => {
    const count = parseInt(mineCount, 10)
    if (isNaN(count) || count < LAB_MIN_BLOCKS_PER_MINE) {
      toast.error('Enter a valid block count')
      return
    }
    if (count > LAB_MAX_BLOCKS_PER_MINE) {
      toast.error(
        `Mine at most ${LAB_MAX_BLOCKS_PER_MINE} blocks at once so the app stays responsive`,
      )
      return
    }
    const effectiveTarget =
      ownerType === 'wallet' ? (currentAddress ?? '').trim() : targetAddress.trim()
    const mineOptions =
      ownerType === 'wallet' && activeWalletId != null
        ? { ownerWalletId: activeWalletId }
        : ownerName.trim()
          ? { ownerName: ownerName.trim() }
          : undefined
    mineMutation.mutate({
      count,
      effectiveTarget,
      mineOptions,
      labAddressType,
    })
  }, [
    mineCount,
    ownerType,
    targetAddress,
    ownerName,
    currentAddress,
    activeWalletId,
    mineMutation,
    labAddressType,
  ])

  const handleResetLab = useCallback(() => {
    setShowResetConfirm(false)
    resetMutation.mutate()
  }, [resetMutation])

  const handleCreateRandomTransactions = useCallback(() => {
    const parsedCount = Number.parseInt(randomTransactionCount, 10)
    if (Number.isNaN(parsedCount) || parsedCount < 1) {
      toast.error('Enter a valid transaction count')
      return
    }
    if (parsedCount > LAB_MAX_RANDOM_ENTITY_TRANSACTIONS) {
      toast.error(`You can generate at most ${LAB_MAX_RANDOM_ENTITY_TRANSACTIONS} transactions`)
      return
    }
    setRandomBatchProgress({ created: 0, total: parsedCount })
    void createRandomTxMutation
      .mutateAsync({
        count: parsedCount,
        onProgress: (created, total) => setRandomBatchProgress({ created, total }),
      })
      .catch(() => {
        /* error toast from mutation onError */
      })
      .finally(() => setRandomBatchProgress(null))
  }, [createRandomTxMutation, randomTransactionCount])

  const controlledAddresses = useMemo(() => {
    return addresses.filter((a) => {
      if (a.wif) return true
      const owner = resolveLabAddressOwner(a.address)
      if (owner == null || owner === '') return false
      if (owner.startsWith(WALLET_OWNER_PREFIX)) return false
      return getBalanceForAddress(a.address) > 0
    })
  }, [addresses, resolveLabAddressOwner, getBalanceForAddress])
  const txDetailsByTxid = useMemo(
    () => new Map(txDetails.map((d) => [d.txid, d])),
    [txDetails],
  )
  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const amountA =
          txDetailsByTxid.get(a.txid)?.outputs.reduce((s, o) => s + o.amountSats, 0) ?? 0
        const amountB =
          txDetailsByTxid.get(b.txid)?.outputs.reduce((s, o) => s + o.amountSats, 0) ?? 0
        return amountB - amountA
      }),
    [transactions, txDetailsByTxid],
  )

  return {
    blocks,
    blockCount,
    mineCount,
    setMineCount,
    ownerType,
    setOwnerType,
    targetAddress,
    setTargetAddress,
    ownerName,
    setOwnerName,
    mining: mineMutation.isPending,
    onMine: handleMine,
    walletStatus,
    currentAddress,
    activeWallet: activeWallet ?? undefined,
    showTxForm,
    setShowTxForm,
    fromAddress,
    setFromAddress,
    toAddress,
    setToAddress,
    amountSats,
    setAmountSats,
    feeRate,
    setFeeRate,
    onSend: handleSend,
    sending: createTxMutation.isPending,
    controlledAddressesCount: controlledAddresses.length,
    randomTransactionCount,
    setRandomTransactionCount,
    onCreateRandomTransactions: handleCreateRandomTransactions,
    creatingRandomTransactions: createRandomTxMutation.isPending,
    randomBatchProgress,
    labEntitiesCount: labState?.entities?.length ?? 0,
    addresses,
    txDetails,
    addressToOwner,
    getBalanceForAddress,
    onCopyAddress: handleCopyAddress,
    wallets,
    utxos,
    mempool,
    sortedTransactions,
    txDetailsByTxid,
    showResetConfirm,
    setShowResetConfirm,
    resetting: resetMutation.isPending,
    onConfirmReset: handleResetLab,
  }
}
