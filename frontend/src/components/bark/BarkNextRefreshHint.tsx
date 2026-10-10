import { Info } from 'lucide-react'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { formatBarkNextRefreshHint } from '@/lib/bark/bark-next-refresh-hint'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

/** When to unlock this wallet again so Bark can refresh its VTXOs. Open wallet and network only. */
export function BarkNextRefreshHint() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  if (!isBarkNetworkMode(networkMode)) return null

  const hint = formatBarkNextRefreshHint({
    nextRefresh: syncSnapshot.nextRefresh,
    networkMode,
  })
  if (hint == null) return null

  return (
    <div
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      role="status"
      data-testid="bark-next-refresh-hint"
      data-period-started={hint.periodStarted}
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-amber-800 dark:text-amber-300">{hint.text}</p>
      </div>
    </div>
  )
}
