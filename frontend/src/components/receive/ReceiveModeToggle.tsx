import { Bitcoin, Layers, Zap } from 'lucide-react'
import { cn } from '@/lib/shared/utils'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'

export type ReceiveMode = 'bitcoin' | 'lightning' | 'arkade'

interface ReceiveModeToggleProps {
  mode: ReceiveMode
  onModeChange: (mode: ReceiveMode) => void
  showLightning: boolean
  showArkade: boolean
}

export function ReceiveModeToggle({
  mode,
  onModeChange,
  showLightning,
  showArkade,
}: ReceiveModeToggleProps) {
  return (
    <InfomodeWrapper
      infoId="receive-mode-toggle"
      infoTitle="Bitcoin, Lightning, and Arkade"
      infoText="Bitcoin (on-chain) uses your bc1 address on the blockchain. Lightning uses invoices or lightning addresses for fast off-chain payments. Arkade uses ark1 or tark1 addresses for the VTXO offchain layer — separate from both. Choose the mode your sender will use."
    >
      <div className="flex w-full rounded-lg border bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => onModeChange('bitcoin')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-all',
            mode === 'bitcoin'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Bitcoin className="h-5 w-5" aria-hidden />
          Bitcoin
        </button>
        {showLightning ? (
          <button
            type="button"
            onClick={() => onModeChange('lightning')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-all',
              mode === 'lightning'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Zap className="h-5 w-5" aria-hidden />
            Lightning
          </button>
        ) : null}
        {showArkade ? (
          <button
            type="button"
            onClick={() => onModeChange('arkade')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-all',
              mode === 'arkade'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Layers className="h-5 w-5" aria-hidden />
            Arkade
          </button>
        ) : null}
      </div>
    </InfomodeWrapper>
  )
}
