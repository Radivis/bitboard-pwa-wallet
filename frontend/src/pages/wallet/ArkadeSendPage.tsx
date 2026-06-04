import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Layers } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useArkadeSendMutation } from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useWalletStore } from '@/stores/walletStore'

export function ArkadeSendPage() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const [recipient, setRecipient] = useState('')
  const [amountSats, setAmountSats] = useState('')
  const sendMutation = useArkadeSendMutation()

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Arkade send" icon={Layers} />
        <p className="text-muted-foreground">Arkade is not enabled for this network.</p>
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet">Back</Link>
        </Button>
      </div>
    )
  }

  const amount = Number.parseInt(amountSats, 10)
  const canSend =
    recipient.trim().length > 0 &&
    Number.isFinite(amount) &&
    amount > 0 &&
    !sendMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader title="Send on Arkade" icon={Layers} />
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="arkade-recipient">Arkade address</Label>
            <Input
              id="arkade-recipient"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="ark1… or tark1…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="arkade-amount">Amount (sats)</Label>
            <Input
              id="arkade-amount"
              type="number"
              min={1}
              value={amountSats}
              onChange={(event) => setAmountSats(event.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={!canSend}
            onClick={() =>
              sendMutation.mutate({ address: recipient.trim(), amountSats: amount })
            }
          >
            {sendMutation.isPending ? 'Sending…' : 'Send'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
