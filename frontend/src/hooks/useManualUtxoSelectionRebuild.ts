import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/shared/utils'
import type { ReviewInputUtxo } from '@/workers/crypto-api'

const MANUAL_UTXO_REBUILD_DEBOUNCE_MS = 200

const MANUAL_UTXO_REBUILD_ERROR_TOAST =
  'Failed to update transaction for the selected inputs'

export function useManualUtxoSelectionRebuild({
  manualSelectionEnabled,
  localSelectedUtxos,
  selectionRevision,
  onRebuildWithSelectedUtxos,
}: {
  manualSelectionEnabled: boolean
  localSelectedUtxos: ReviewInputUtxo[]
  /** Incremented on user add/remove so we do not rebuild when manual mode is first enabled. */
  selectionRevision: number
  onRebuildWithSelectedUtxos: (selected: ReviewInputUtxo[]) => Promise<void>
}) {
  const onRebuildRef = useRef(onRebuildWithSelectedUtxos)
  onRebuildRef.current = onRebuildWithSelectedUtxos

  const { mutate, reset, isPending, isError } = useMutation({
    mutationFn: (selected: ReviewInputUtxo[]) => onRebuildRef.current(selected),
    onError: (err) => {
      toast.error(errorMessage(err) || MANUAL_UTXO_REBUILD_ERROR_TOAST)
    },
  })

  useEffect(() => {
    if (
      !manualSelectionEnabled ||
      selectionRevision === 0 ||
      localSelectedUtxos.length === 0
    ) {
      return
    }

    const debounceTimerId = window.setTimeout(() => {
      mutate(localSelectedUtxos)
    }, MANUAL_UTXO_REBUILD_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(debounceTimerId)
    }
  }, [manualSelectionEnabled, selectionRevision, localSelectedUtxos, mutate])

  useEffect(() => {
    if (!manualSelectionEnabled) {
      reset()
    }
  }, [manualSelectionEnabled, reset])

  return {
    isRebuildPending: isPending,
    isRebuildError: isError,
    resetRebuild: reset,
  }
}
