import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { BARK_EXIT_SEIZURE_WARNING } from '@/lib/bark/bark-exit-seizure'

/** Shown after a sync recorded VTXOs spent because an exit output was taken on-chain. */
export function BarkExitSeizureWarning() {
  const seizedVtxoIds = useBarkSyncLifecycleSnapshot().seizedVtxoIds ?? []
  if (seizedVtxoIds.length === 0) return null

  return (
    <p className="text-sm text-destructive" data-testid="bark-exit-seizure-warning" role="status">
      {BARK_EXIT_SEIZURE_WARNING}
    </p>
  )
}
