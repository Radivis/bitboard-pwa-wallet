import { Loader2, Zap } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import { cn } from '@/lib/shared/utils'

type BalanceQuery = {
  isPending: boolean
  isError: boolean
  data?: { balanceSats: number }
}

export function SendLightningWalletPicker(props: {
  connectedLightningWallets: ConnectedLightningWallet[]
  balanceQueries: BalanceQuery[]
  selectedConnectionId: string | null
  onSelectConnection: (id: string) => void
  disabled: boolean
}) {
  const {
    connectedLightningWallets,
    balanceQueries,
    selectedConnectionId,
    onSelectConnection,
    disabled,
  } = props

  if (connectedLightningWallets.length === 0) return null

  return (
    <div className="space-y-2">
      <Label>Pay from Lightning wallet</Label>
      <p className="text-xs text-muted-foreground">
        {connectedLightningWallets.length > 1
          ? 'Select which connected wallet should pay this invoice.'
          : 'Using your connected Lightning wallet for this network.'}
      </p>
      <ul className="space-y-2">
        {connectedLightningWallets.map((connection, index) => {
          const balanceQuery = balanceQueries[index]
          const isSelected = connection.id === selectedConnectionId
          return (
            <li key={connection.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectConnection(connection.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left text-sm transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <span className="min-w-0 flex-1 font-medium">{connection.label}</span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                  {balanceQuery?.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : balanceQuery?.isError ? (
                    <span className="text-destructive">—</span>
                  ) : (
                    <>
                      <Zap className="h-3 w-3" />
                      <BitcoinAmountDisplay
                        amountSats={balanceQuery?.data?.balanceSats ?? 0}
                        size="sm"
                        className="inline text-muted-foreground"
                        allowUnitToggle={false}
                      />
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
