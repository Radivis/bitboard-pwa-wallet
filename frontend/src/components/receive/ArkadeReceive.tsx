import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Copy, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useArkadeAddressQuery, useArkadeBalanceQuery } from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useWalletStore } from '@/stores/walletStore'

export function ArkadeReceive() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const [copied, setCopied] = useState(false)
  const addressQuery = useArkadeAddressQuery()
  // Poll balance (and run WASM key discovery) while the user waits on Receive.
  useArkadeBalanceQuery()

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <p className="text-sm text-muted-foreground">
        Enable Arkade under Settings → Features and select a supported network (mainnet,
        testnet, or signet).{' '}
        <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
          Open settings
        </Link>
      </p>
    )
  }

  const address = addressQuery.data ?? ''

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast.success('Arkade address copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy address')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arkade address</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This is not your on-chain <code className="text-xs">bc1</code> address. Send
          Arkade payments only to this address (<code className="text-xs">ark1</code> /{' '}
          <code className="text-xs">tark1</code>).
        </p>
        {addressQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading address…
          </div>
        ) : addressQuery.isError ? (
          <p className="text-sm text-destructive">
            Could not load Arkade address. Unlock the wallet and check your network.
          </p>
        ) : (
          <>
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <QRCodeSVG value={address} size={256} level="M" />
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
  )
}
