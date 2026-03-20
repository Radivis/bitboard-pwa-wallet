import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { useWalletStore } from '@/stores/walletStore'
import { useWallet, useWallets } from '@/db'
import {
  useLabMineBlocksMutation,
  useLabCreateTransactionMutation,
  useLabResetMutation,
} from '@/hooks/useLabMutations'
import {
  LAB_MAX_BLOCKS_PER_MINE,
  LAB_MIN_BLOCKS_PER_MINE,
} from '@/workers/lab-api'

const DEFAULT_LAB_FEE_RATE_SAT_PER_VB = 1

/**
 * Form state, derived lab lists, and TanStack Query mutations for the lab index page.
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

  const [mineCount, setMineCount] = useState(String(LAB_MIN_BLOCKS_PER_MINE))
  const [ownerType, setOwnerType] = useState<'name' | 'wallet'>('name')
  const [targetAddress, setTargetAddress] = useState('')
  const [ownerName, setOwnerName] = useState('')

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const { data: activeWallet } = useWallet(activeWalletId ?? 0)
  const { data: wallets = [] } = useWallets()

  const [showTxForm, setShowTxForm] = useState(false)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [amountSats, setAmountSats] = useState('')
  const [feeRate, setFeeRate] = useState(String(DEFAULT_LAB_FEE_RATE_SAT_PER_VB))

  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const mineMutation = useLabMineBlocksMutation()
  const createTxMutation = useLabCreateTransactionMutation()
  const resetMutation = useLabResetMutation()

  const getBalanceForAddress = useCallback(
    (address: string) =>
      utxos
        .filter((u) => u.address === address)
        .reduce((sum, u) => sum + u.amountSats, 0),
    [utxos],
  )

  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Address copied to clipboard')
    } catch {
      toast.error('Failed to copy address')
    }
  }, [])

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
    mineMutation.mutate({ count, effectiveTarget, mineOptions })
  }, [
    mineCount,
    ownerType,
    targetAddress,
    ownerName,
    currentAddress,
    activeWalletId,
    mineMutation,
  ])

  const handleSend = useCallback(() => {
    const amount = parseInt(amountSats, 10)
    const fee = parseFloat(feeRate)
    if (isNaN(amount) || amount < 1) {
      toast.error('Enter a valid amount')
      return
    }
    if (!fromAddress) {
      toast.error('Select a from address')
      return
    }
    if (!toAddress.trim()) {
      toast.error('Enter a to address')
      return
    }
    void createTxMutation
      .mutateAsync({
        fromAddress,
        toAddress: toAddress.trim(),
        amountSats: amount,
        feeRateSatPerVb: fee,
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
  }, [fromAddress, toAddress, amountSats, feeRate, createTxMutation])

  const handleResetLab = useCallback(() => {
    setShowResetConfirm(false)
    resetMutation.mutate()
  }, [resetMutation])

  const controlledAddresses = addresses.filter((a) => a.wif)
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

  const { utxosByOwner, sortedOwnerKeys } = useMemo(() => {
    const byOwner = new Map<string, typeof utxos>()
    for (const utxo of utxos) {
      const owner = (addressToOwner ?? {})[utxo.address] ?? 'Unknown'
      const ownerList = byOwner.get(owner) ?? []
      ownerList.push(utxo)
      byOwner.set(owner, ownerList)
    }
    const sortedOwners = [...byOwner.keys()].sort((a, b) =>
      a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b),
    )
    return { utxosByOwner: byOwner, sortedOwnerKeys: sortedOwners }
  }, [utxos, addressToOwner])

  return {
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
    addresses,
    addressToOwner,
    getBalanceForAddress,
    onCopyAddress: handleCopyAddress,
    wallets,
    utxos,
    utxosByOwner,
    sortedOwnerKeys,
    mempool,
    sortedTransactions,
    txDetailsByTxid,
    showResetConfirm,
    setShowResetConfirm,
    resetting: resetMutation.isPending,
    onConfirmReset: handleResetLab,
  }
}
