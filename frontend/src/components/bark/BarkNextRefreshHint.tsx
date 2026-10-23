import { BarkInfoNotice } from '@/components/bark/BarkInfoNotice'
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
    <BarkInfoNotice data-testid="bark-next-refresh-hint" data-period-started={hint.periodStarted}>
      {hint.text}
    </BarkInfoNotice>
  )
}
