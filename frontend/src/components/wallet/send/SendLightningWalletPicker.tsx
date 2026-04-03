import { Loader2, Zap } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { formatSats } from '@/lib/bitcoin-utils'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'
import { cn } from '@/lib/utils'

type BalanceQuery = {
  isPending: boolean
  isError: boolean
  data?: { balanceSats: number }
}

export function SendLightningWalletPicker(props: {
  connections: ConnectedLightningWallet[]
  lnBalanceQueries: BalanceQuery[]
  selectedConnectionId: string | null
  onSelectConnection: (id: string) => void
  disabled: boolean
}) {
  const {
    connections,
    lnBalanceQueries,
    selectedConnectionId,
    onSelectConnection,
    disabled,
  } = props

  if (connections.length === 0) return null

  return (
    <div className="space-y-2">
      <Label>Pay from Lightning wallet</Label>
      <p className="text-xs text-muted-foreground">
        {connections.length > 1
          ? 'Select which connected wallet should pay this invoice.'
          : 'Using your connected Lightning wallet for this network.'}
      </p>
      <ul className="space-y-2">
        {connections.map((conn, index) => {
          const q = lnBalanceQueries[index]
          const isSelected = conn.id === selectedConnectionId
          return (
            <li key={conn.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectConnection(conn.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left text-sm transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <span className="min-w-0 flex-1 font-medium">{conn.label}</span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                  {q?.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : q?.isError ? (
                    <span className="text-destructive">—</span>
                  ) : (
                    <>
                      <Zap className="h-3 w-3" />
                      {formatSats(q?.data?.balanceSats ?? 0)} sats
                    </>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
