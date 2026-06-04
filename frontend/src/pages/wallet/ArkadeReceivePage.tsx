import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Copy, Layers } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { openArkadeSessionForWallet } from '@/lib/arkade/arkade-session-service'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { toast } from 'sonner'

export function ArkadeReceivePage() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)
  const [copied, setCopied] = useState(false)

  const addressQuery = useQuery({
    queryKey: ['arkade', 'receive-address', activeWalletId, networkMode],
    enabled:
      isArkadeActiveForNetworkMode(networkMode) &&
      activeWalletId != null &&
      password != null,
    queryFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet locked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().getAddress()
    },
  })

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Arkade receive" icon={Layers} />
        <p className="text-muted-foreground">
          Enable Arkade under Settings → Features and select a supported network
          (mainnet, testnet, or signet).
        </p>
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet">Back to dashboard</Link>
        </Button>
      </div>
    )
  }

  const address = addressQuery.data ?? ''

  const handleCopy = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Arkade address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Receive on Arkade" icon={Layers} />
      <Card>
        <CardHeader>
          <CardTitle>Arkade address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This is not your on-chain <code className="text-xs">bc1</code> address. Send
            Arkade payments only to this address.
          </p>
          {addressQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading address…</p>
          ) : (
            <>
              <div className="flex justify-center rounded-lg border bg-white p-4">
                <QRCodeSVG value={address} size={200} />
              </div>
              <p className="break-all font-mono text-sm">{address}</p>
              <Button type="button" onClick={handleCopy} disabled={!address}>
                <Copy className="h-4 w-4" aria-hidden />
                {copied ? 'Copied' : 'Copy address'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
