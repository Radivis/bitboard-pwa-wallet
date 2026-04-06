import { Bitcoin, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'

export type ReceiveMode = 'bitcoin' | 'lightning'

interface ReceiveModeToggleProps {
  mode: ReceiveMode
  onModeChange: (mode: ReceiveMode) => void
}

export function ReceiveModeToggle({ mode, onModeChange }: ReceiveModeToggleProps) {
  return (
    <InfomodeWrapper
      infoId="receive-mode-toggle"
      infoTitle="Bitcoin vs Lightning"
      infoText="Bitcoin (on-chain) transactions are settled directly on the blockchain — reliable but slower and with higher fees. Lightning transactions use payment channels for near-instant, low-fee transfers. Choose the mode that matches how your sender will pay you."
    >
      <div className="flex w-full rounded-lg border bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => onModeChange('bitcoin')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-all',
            mode === 'bitcoin'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Bitcoin className="h-5 w-5" />
          Bitcoin
        </button>
        <button
          type="button"
          onClick={() => onModeChange('lightning')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-all',
            mode === 'lightning'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Zap className="h-5 w-5" />
          Lightning
        </button>
      </div>
    </InfomodeWrapper>
  )
}
