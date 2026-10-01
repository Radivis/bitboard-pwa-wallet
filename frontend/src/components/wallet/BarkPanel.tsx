import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function BarkPanel() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  if (!isBarkActiveForNetworkMode(networkMode)) return null

  return (
    <Card data-testid="bark-management-panel">
      <CardHeader>
        <CardTitle>Bark</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
