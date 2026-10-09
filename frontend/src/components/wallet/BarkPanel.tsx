import { Link } from '@tanstack/react-router'
import { BarkSessionGate } from '@/components/bark/BarkSessionGate'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarkPendingActionBanner } from '@/components/wallet/BarkPendingActionBanner'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function BarkPanel() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  if (!isBarkActiveForNetworkMode(networkMode)) return null
  if (loadSnapshot.loadPhase === 'not-configured') return null

  return (
    <Card data-testid="bark-management-panel">
      <CardHeader>
        <CardTitle>Bark</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <BarkSessionGate
          loadPhase={loadSnapshot.loadPhase}
          errorMessage={loadSnapshot.errorMessage}
          embedded
        >
          <>
            <BarkPendingActionBanner />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/wallet/bark/vtxos" data-testid="bark-list-vtxos-link">
                  List VTXOs
                </Link>
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/wallet/bark/emergency-exit" data-testid="bark-emergency-exit-link">
                  Emergency exit
                </Link>
              </Button>
            </div>
          </>
        </BarkSessionGate>
      </CardContent>
    </Card>
  )
}
