import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { ReviewInputUtxoList } from '@/components/wallet/send/ReviewInputUtxoList'
import { useManualUtxoSelectionRebuild } from '@/hooks/useManualUtxoSelectionRebuild'
import {
  isManualUtxoSelectionSufficient,
  moveUtxoToAvailable,
  moveUtxoToSelected,
  splitUtxosBySelection,
  sumReviewUtxoAmountSats,
} from '@/lib/wallet/manual-utxo-selection'
import type { ReviewInputUtxo } from '@/workers/crypto-api'

export function ManualUtxoSelectionSection({
  amountSats,
  reviewFeeSats,
  selectedInputUtxos,
  onLoadAllWalletUtxos,
  onRebuildWithSelectedUtxos,
  onRevertToAutoSelection,
  onManualSelectionStateChange,
}: {
  amountSats: number
  reviewFeeSats: number | null
  selectedInputUtxos: ReviewInputUtxo[]
  onLoadAllWalletUtxos: () => Promise<ReviewInputUtxo[]>
  onRebuildWithSelectedUtxos: (selected: ReviewInputUtxo[]) => Promise<void>
  onRevertToAutoSelection: () => Promise<void>
  onManualSelectionStateChange: (state: {
    manualSelectionEnabled: boolean
    confirmBlocked: boolean
  }) => void
}) {
  const [manualSelectionEnabled, setManualSelectionEnabled] = useState(false)
  const [availableUtxos, setAvailableUtxos] = useState<ReviewInputUtxo[]>([])
  const [localSelectedUtxos, setLocalSelectedUtxos] = useState<ReviewInputUtxo[]>(
    selectedInputUtxos,
  )
  const [selectionRevision, setSelectionRevision] = useState(0)
  const onManualSelectionStateChangeRef = useRef(onManualSelectionStateChange)
  const lastNotifiedManualSelectionStateRef = useRef<{
    manualSelectionEnabled: boolean
    confirmBlocked: boolean
  } | null>(null)

  onManualSelectionStateChangeRef.current = onManualSelectionStateChange

  const { isRebuildPending, isRebuildError, resetRebuild } = useManualUtxoSelectionRebuild({
    manualSelectionEnabled,
    localSelectedUtxos,
    selectionRevision,
    onRebuildWithSelectedUtxos,
  })

  useEffect(() => {
    if (!manualSelectionEnabled) {
      setLocalSelectedUtxos(selectedInputUtxos)
    }
  }, [manualSelectionEnabled, selectedInputUtxos])

  const selectedSumSats = useMemo(
    () => sumReviewUtxoAmountSats(localSelectedUtxos),
    [localSelectedUtxos],
  )

  const selectionSufficient = isManualUtxoSelectionSufficient(
    selectedSumSats,
    amountSats,
    reviewFeeSats,
  )

  const confirmBlocked =
    manualSelectionEnabled &&
    (isRebuildPending ||
      isRebuildError ||
      !selectionSufficient ||
      localSelectedUtxos.length === 0)

  useEffect(() => {
    const nextState = { manualSelectionEnabled, confirmBlocked }
    const previousState = lastNotifiedManualSelectionStateRef.current
    if (
      previousState != null &&
      previousState.manualSelectionEnabled === nextState.manualSelectionEnabled &&
      previousState.confirmBlocked === nextState.confirmBlocked
    ) {
      return
    }
    lastNotifiedManualSelectionStateRef.current = nextState
    onManualSelectionStateChangeRef.current(nextState)
  }, [manualSelectionEnabled, confirmBlocked])

  const handleManualToggle = useCallback(
    async (checked: boolean) => {
      if (checked) {
        const allWalletUtxos = await onLoadAllWalletUtxos()
        const split = splitUtxosBySelection(allWalletUtxos, selectedInputUtxos)
        setLocalSelectedUtxos(split.selected)
        setAvailableUtxos(split.available)
        setSelectionRevision(0)
        resetRebuild()
        setManualSelectionEnabled(true)
        return
      }

      setManualSelectionEnabled(false)
      setAvailableUtxos([])
      setSelectionRevision(0)
      resetRebuild()
      await onRevertToAutoSelection()
    },
    [onLoadAllWalletUtxos, onRevertToAutoSelection, resetRebuild, selectedInputUtxos],
  )

  const handleAddUtxo = useCallback(
    (utxo: ReviewInputUtxo) => {
      const next = moveUtxoToSelected(localSelectedUtxos, availableUtxos, utxo)
      setLocalSelectedUtxos(next.selected)
      setAvailableUtxos(next.available)
      setSelectionRevision((revision) => revision + 1)
    },
    [availableUtxos, localSelectedUtxos],
  )

  const handleRemoveUtxo = useCallback(
    (utxo: ReviewInputUtxo) => {
      const next = moveUtxoToAvailable(localSelectedUtxos, availableUtxos, utxo)
      setLocalSelectedUtxos(next.selected)
      setAvailableUtxos(next.available)
      setSelectionRevision((revision) => revision + 1)
    },
    [availableUtxos, localSelectedUtxos],
  )

  const showInsufficientSum =
    manualSelectionEnabled &&
    !isRebuildPending &&
    (isRebuildError || !selectionSufficient || localSelectedUtxos.length === 0)

  return (
    <div className="space-y-3">
      {manualSelectionEnabled ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Selected inputs total</span>
            <span className={showInsufficientSum ? 'text-destructive' : undefined}>
              <BitcoinAmountDisplay amountSats={selectedSumSats} size="sm" />
            </span>
          </div>
          {isRebuildPending ? (
            <p className="text-xs text-muted-foreground">Updating fee…</p>
          ) : null}
        </div>
      ) : null}

      <ReviewInputUtxoList
        inputUtxos={manualSelectionEnabled ? localSelectedUtxos : selectedInputUtxos}
        action={manualSelectionEnabled ? 'remove' : undefined}
        onAction={manualSelectionEnabled ? handleRemoveUtxo : undefined}
      />

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="manual-utxo-selection" className="cursor-pointer text-sm">
          Manual UTXO selection
        </Label>
        <Switch
          id="manual-utxo-selection"
          checked={manualSelectionEnabled}
          onCheckedChange={(checked) => {
            void handleManualToggle(checked)
          }}
          aria-label="Enable manual UTXO selection"
        />
      </div>

      {manualSelectionEnabled ? (
        <>
          <div className="border-t pt-3">
            <p className="mb-2 text-sm font-medium">Available UTXOs</p>
            {availableUtxos.length > 0 ? (
              <ReviewInputUtxoList
                inputUtxos={availableUtxos}
                action="add"
                onAction={handleAddUtxo}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No other UTXOs available.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
