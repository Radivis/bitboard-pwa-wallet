import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  type LabCreateTransactionVariables,
} from '@/hooks/useLabMutations'
import { LAB_MAX_BLOCKS_PER_MINE, LAB_MIN_BLOCKS_PER_MINE } from '@/workers/lab-api'
import { LAB_MAX_RANDOM_ENTITY_TRANSACTIONS } from '@/lib/lab-random-limits'
import { labEntityOwnerKey } from '@/lib/lab-entity-keys'
import { labEntityRecordForLabOwner, walletLabOwner } from '@/lib/lab-owner'
import {
  assertLabAddressOwnerResolved,
  labBitcoinAddressesEqual,
  lookupLabAddressOwner,
  resolveDeadLabEntityRecipient,
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
  const entities = labState?.entities ?? []

  const blockCount = blocks.length === 0 ? 0 : blocks[blocks.length - 1].height + 1

  const mineCount = useLabMiningStore((s) => s.mineCount)
  const setMineCount = useLabMiningStore((s) => s.setMineCount)
  const ownerType = useLabMiningStore((s) => s.ownerType)
  const setOwnerType = useLabMiningStore((s) => s.setOwnerType)
  const selectedLabEntityId = useLabMiningStore((s) => s.selectedLabEntityId)
  const setSelectedLabEntityId = useLabMiningStore((s) => s.setSelectedLabEntityId)

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
  const [pendingDeadLabSend, setPendingDeadLabSend] = useState<{
    displayName: string
    variables: LabCreateTransactionVariables
  } | null>(null)

  const mineMutation = useLabMineBlocksMutation()
  const createTxMutation = useLabCreateTransactionMutation()

  useEffect(() => {
    const living = entities.filter((e) => !e.isDead)
    if (living.length === 0) {
      setSelectedLabEntityId(null)
      return
    }
    const prev = useLabMiningStore.getState().selectedLabEntityId
    if (prev != null && living.some((e) => e.labEntityId === prev)) return
    setSelectedLabEntityId(living[0].labEntityId)
  }, [entities, setSelectedLabEntityId])
  const createRandomTxMutation = useLabCreateRandomTransactionsMutation()
  const resetMutation = useLabResetMutation()

  const getBalanceForAddress = useCallback(
    (address: string) =>
      utxos
        .filter((utxo) => labBitcoinAddressesEqual(utxo.address, address))
        .reduce((sumSats, utxo) => sumSats + utxo.amountSats, 0),
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

  const { fromEntityDead, deadFromEntityDisplayName } = useMemo(() => {
    const trimmedFrom = fromAddress.trim()
    if (!trimmedFrom) {
      return { fromEntityDead: false, deadFromEntityDisplayName: '' }
    }
    const ownerLab = lookupLabAddressOwner(trimmedFrom, addressToOwner)
    if (ownerLab?.kind !== 'lab_entity') {
      return { fromEntityDead: false, deadFromEntityDisplayName: '' }
    }
    const record = labEntityRecordForLabOwner(ownerLab, entities)
    if (record == null || !record.isDead) {
      return { fromEntityDead: false, deadFromEntityDisplayName: '' }
    }
    return { fromEntityDead: true, deadFromEntityDisplayName: labEntityOwnerKey(record) }
  }, [fromAddress, addressToOwner, entities])

  const prevFromEntityDeadRef = useRef(false)
  useEffect(() => {
    if (fromEntityDead && !prevFromEntityDeadRef.current && deadFromEntityDisplayName) {
      toast.error(
        `The address belongs to DEAD lab entity ${deadFromEntityDisplayName}. Dead entities cannot send.`,
      )
    }
    prevFromEntityDeadRef.current = fromEntityDead
  }, [fromEntityDead, deadFromEntityDisplayName])

  const closeDeadRecipientModal = useCallback(() => {
    setPendingDeadLabSend(null)
  }, [])

  const confirmDeadRecipientSend = useCallback(() => {
    if (pendingDeadLabSend == null) return
    void createTxMutation
      .mutateAsync(pendingDeadLabSend.variables)
      .then(() => {
        setPendingDeadLabSend(null)
        setShowTxForm(false)
        setFromAddress('')
        setToAddress('')
        setAmountSats('')
      })
      .catch(() => {
        /* error toast from mutation onError */
      })
  }, [pendingDeadLabSend, createTxMutation])

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
    const ownerLab = lookupLabAddressOwner(trimmedFrom, addressToOwner)
    assertLabAddressOwnerResolved(trimmedFrom, ownerLab, 'send from')
    if (ownerLab.kind === 'wallet') {
      toast.error('Spend from a lab entity address (use Send for your wallet)')
      return
    }
    const fromEntity = labEntityRecordForLabOwner(ownerLab, entities)
    if (fromEntity?.isDead === true) {
      toast.error(
        `The address belongs to DEAD lab entity ${labEntityOwnerKey(fromEntity)}. Dead entities cannot send.`,
      )
      return
    }
    const trimmedTo = toAddress.trim()
    const knownRecipientOwner =
      activeWalletId != null &&
      currentAddress != null &&
      labBitcoinAddressesEqual(trimmedTo, currentAddress)
        ? walletLabOwner(activeWalletId)
        : undefined

    const deadTo = resolveDeadLabEntityRecipient(trimmedTo, addressToOwner, entities)
    if (deadTo != null) {
      setPendingDeadLabSend({
        displayName: deadTo.displayName,
        variables: {
          labEntityId: ownerLab.labEntityId,
          fromAddress: trimmedFrom,
          toAddress: trimmedTo,
          amountSats: amount,
          feeRateSatPerVb: fee,
          knownRecipientOwner,
        },
      })
      return
    }

    void createTxMutation
      .mutateAsync({
        labEntityId: ownerLab.labEntityId,
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
    addressToOwner,
    activeWalletId,
    currentAddress,
    entities,
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
      ownerType === 'wallet' ? (currentAddress ?? '').trim() : ''
    const mineOptions =
      ownerType === 'wallet' && activeWalletId != null
        ? { ownerWalletId: activeWalletId }
        : ownerType === 'name' && selectedLabEntityId != null
          ? { ownerLabEntityId: selectedLabEntityId }
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
    selectedLabEntityId,
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
      const owner = lookupLabAddressOwner(a.address, addressToOwner)
      if (owner == null) return false
      if (owner.kind === 'wallet') return false
      return getBalanceForAddress(a.address) > 0
    })
  }, [addresses, addressToOwner, getBalanceForAddress])
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
    selectedLabEntityId,
    setSelectedLabEntityId,
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
    sendDisabledFromDeadEntity: fromEntityDead,
    deadFromEntityDisplayName,
    deadRecipientModalOpen: pendingDeadLabSend != null,
    deadRecipientModalDisplayName: pendingDeadLabSend?.displayName ?? '',
    onConfirmDeadRecipientSend: confirmDeadRecipientSend,
    onCloseDeadRecipientModal: closeDeadRecipientModal,
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
    entities,
    showResetConfirm,
    setShowResetConfirm,
    resetting: resetMutation.isPending,
    onConfirmReset: handleResetLab,
  }
}
