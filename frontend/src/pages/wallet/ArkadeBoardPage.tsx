import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Copy, Layers } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { openArkadeSessionForWallet } from '@/lib/arkade/arkade-session-service'
import { useArkadeOnboardMutation } from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { toast } from 'sonner'

export function ArkadeBoardPage() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)
  const onboardMutation = useArkadeOnboardMutation()
  const [copied, setCopied] = useState(false)

  const boardingQuery = useQuery({
    queryKey: ['arkade', 'boarding-address', activeWalletId, networkMode],
    enabled:
      isArkadeActiveForNetworkMode(networkMode) &&
      activeWalletId != null &&
      password != null,
    queryFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet locked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().getBoardingAddress()
    },
  })

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Board to Arkade" icon={Layers} />
        <p className="text-muted-foreground">Arkade is not enabled for this network.</p>
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet">Back</Link>
        </Button>
      </div>
    )
  }

  const boardingAddress = boardingQuery.data ?? ''

  const handleCopy = async () => {
    if (!boardingAddress) return
    await navigator.clipboard.writeText(boardingAddress)
    setCopied(true)
    toast.success('Boarding address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Board to Arkade" icon={Layers} />
      <Card>
        <CardHeader>
          <CardTitle>From on-chain to Arkade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Copy the boarding address below.</li>
            <li>
              Send Bitcoin from your{' '}
              <Link to="/wallet/send" className="text-primary underline-offset-4 hover:underline">
                on-chain wallet
              </Link>{' '}
              to that address and wait for confirmation.
            </li>
            <li>Settle the boarding UTXO into Arkade (creates VTXOs).</li>
          </ol>

          {boardingQuery.isLoading ? (
            <p className="text-muted-foreground">Loading boarding address…</p>
          ) : (
            <>
              <p className="break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">
                {boardingAddress}
              </p>
              <Button type="button" variant="outline" onClick={handleCopy} disabled={!boardingAddress}>
                <Copy className="h-4 w-4" aria-hidden />
                {copied ? 'Copied' : 'Copy boarding address'}
              </Button>
            </>
          )}

          <Button
            type="button"
            disabled={onboardMutation.isPending || !boardingAddress}
            onClick={() => onboardMutation.mutate()}
          >
            {onboardMutation.isPending ? 'Settling…' : 'Settle boarding UTXO'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
