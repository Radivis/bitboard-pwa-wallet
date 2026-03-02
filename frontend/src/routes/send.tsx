import { createFileRoute } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/send')({
  component: SendPage,
})

function SendForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpRight className="h-5 w-5" />
          Send Transaction
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="space-y-2">
            <Label htmlFor="recipient-address">Recipient Address</Label>
            <Input
              id="recipient-address"
              placeholder="bc1q..."
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="send-amount">Amount (BTC)</Label>
            <Input
              id="send-amount"
              type="number"
              placeholder="0.00000000"
              step="0.00000001"
              min="0"
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fee-rate">Fee Rate (sat/vB)</Label>
            <Input
              id="fee-rate"
              type="number"
              placeholder="1"
              min="1"
              disabled
            />
          </div>

          <Button className="w-full" disabled>
            Send Bitcoin
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Sending will be available after setting up a wallet.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

function SendPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Send Bitcoin</h2>
      <SendForm />
    </div>
  )
}
