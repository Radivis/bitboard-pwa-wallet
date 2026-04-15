import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { UX_DUST_FLOOR_SATS } from '@/lib/bitcoin-dust'
import { errorMessage } from '@/lib/utils'
import { labOpDraftLabEntityTransaction } from '@/lib/lab-worker-operations'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import type { AddressType } from '@/lib/wallet-domain-types'
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
import { LabOwnerType } from '@/lib/lab-owner-type'
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
  const mineOperations = labState?.mineOperations ?? []
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
    addressType: AddressType
    variables: LabCreateTransactionVariables
  } | null>(null)
  const [dustCase2Modal, setDustCase2Modal] = useState<{
    exactAmountSats: number
    changeFreeMaxSats: number
    originalAmountSats: number
    pendingVariables: LabCreateTransactionVariables
  } | null>(null)
  const [sendPrepPending, setSendPrepPending] = useState(false)

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

  const clearSendForm = useCallback(() => {
    setShowTxForm(false)
    setFromAddress('')
    setToAddress('')
    setAmountSats('')
  }, [])

  const runLabEntitySendPipeline = useCallback(
    async (variables: LabCreateTransactionVariables) => {
      let amountSats = variables.amountSats
      const fromBalance = getBalanceForAddress(variables.fromAddress.trim())
      if (
        fromBalance >= UX_DUST_FLOOR_SATS &&
        amountSats > 0 &&
        amountSats < UX_DUST_FLOOR_SATS
      ) {
        amountSats = UX_DUST_FLOOR_SATS
        toast.warning(
          `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`,
        )
        setAmountSats(String(UX_DUST_FLOOR_SATS))
      }

      setSendPrepPending(true)
      try {
        let draftResult: Awaited<ReturnType<typeof labOpDraftLabEntityTransaction>>
        try {
          draftResult = await labOpDraftLabEntityTransaction({
            ...variables,
            amountSats,
          })
        } catch (err) {
          toast.error(errorMessage(err) || 'Failed to prepare lab transaction')
          return
        }

        if (
          draftResult.draft.raisedToMinDust &&
          draftResult.draft.finalAmountSats !== amountSats
        ) {
          amountSats = draftResult.draft.finalAmountSats
          setAmountSats(String(amountSats))
          toast.warning(
            `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`,
          )
          try {
            draftResult = await labOpDraftLabEntityTransaction({
              ...variables,
              amountSats,
            })
          } catch (err) {
            toast.error(errorMessage(err) || 'Failed to prepare lab transaction')
            return
          }
        }

        if (draftResult.draft.changeFreeBumpAvailable) {
          setDustCase2Modal({
            exactAmountSats: draftResult.draft.finalAmountSats,
            changeFreeMaxSats: draftResult.draft.changeFreeMaxSats,
            originalAmountSats: draftResult.draft.originalAmountSats,
            pendingVariables: {
              ...variables,
              amountSats: draftResult.draft.finalAmountSats,
            },
          })
          return
        }

        await createTxMutation.mutateAsync({
          ...variables,
          amountSats: draftResult.draft.finalAmountSats,
          applyChangeFreeBump: false,
        })
        clearSendForm()
      } finally {
        setSendPrepPending(false)
      }
    },
    [createTxMutation, getBalanceForAddress, clearSendForm],
  )

  const confirmDeadRecipientSend = useCallback(() => {
    if (pendingDeadLabSend == null) return
    const variables = pendingDeadLabSend.variables
    setPendingDeadLabSend(null)
    void runLabEntitySendPipeline(variables).catch(() => {
      /* error toast from pipeline or mutation */
    })
  }, [pendingDeadLabSend, runLabEntitySendPipeline])

  const onDustCase2KeepExact = useCallback(() => {
    if (dustCase2Modal == null) return
    const { pendingVariables } = dustCase2Modal
    setDustCase2Modal(null)
    void createTxMutation
      .mutateAsync({
        ...pendingVariables,
        applyChangeFreeBump: false,
      })
      .then(() => {
        clearSendForm()
      })
      .catch(() => {
        /* error toast from mutation onError */
      })
  }, [dustCase2Modal, createTxMutation, clearSendForm])

  const onDustCase2IncreaseToChangeFree = useCallback(() => {
    if (dustCase2Modal == null) return
    const { pendingVariables } = dustCase2Modal
    setDustCase2Modal(null)
    void createTxMutation
      .mutateAsync({
        ...pendingVariables,
        applyChangeFreeBump: true,
      })
      .then(() => {
        clearSendForm()
      })
      .catch(() => {
        /* error toast from mutation onError */
      })
  }, [dustCase2Modal, createTxMutation, clearSendForm])

  const closeDustCase2Modal = useCallback(() => {
    setDustCase2Modal(null)
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
        addressType: deadTo.addressType,
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

    void runLabEntitySendPipeline({
      labEntityId: ownerLab.labEntityId,
      fromAddress: trimmedFrom,
      toAddress: trimmedTo,
      amountSats: amount,
      feeRateSatPerVb: fee,
      knownRecipientOwner,
    }).catch(() => {
      /* error toast from pipeline or mutation */
    })
  }, [
    fromAddress,
    toAddress,
    amountSats,
    feeRate,
    runLabEntitySendPipeline,
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
      ownerType === LabOwnerType.Wallet ? (currentAddress ?? '').trim() : ''
    const mineOptions =
      ownerType === LabOwnerType.Wallet && activeWalletId != null
        ? { ownerWalletId: activeWalletId }
        : ownerType === LabOwnerType.LabEntity && selectedLabEntityId != null
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
    mineOperations,
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
    sending: createTxMutation.isPending || sendPrepPending,
    sendDisabledFromDeadEntity: fromEntityDead,
    deadFromEntityDisplayName,
    deadRecipientModalOpen: pendingDeadLabSend != null,
    deadRecipientModalDisplayName: pendingDeadLabSend?.displayName ?? '',
    deadRecipientModalAddressType: pendingDeadLabSend?.addressType,
    onConfirmDeadRecipientSend: confirmDeadRecipientSend,
    onCloseDeadRecipientModal: closeDeadRecipientModal,
    dustCase2ModalOpen: dustCase2Modal != null,
    dustCase2ExactAmountSats: dustCase2Modal?.exactAmountSats ?? 0,
    dustCase2ChangeFreeMaxSats: dustCase2Modal?.changeFreeMaxSats ?? 0,
    onDustCase2KeepExact,
    onDustCase2IncreaseToChangeFree,
    onCloseDustCase2Modal: closeDustCase2Modal,
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
