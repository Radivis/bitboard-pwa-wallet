import { Bitcoin, Dog, Zap } from 'lucide-react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { cn } from '@/lib/shared/utils'
import { ReceiveModeArkadeInfomodeContent } from '@/components/arkade/infomode/ReceiveModeArkadeInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'

export type ReceiveMode = 'bitcoin' | 'lightning' | 'arkade' | 'bark'

interface ReceiveModeToggleProps {
  mode: ReceiveMode
  onModeChange: (mode: ReceiveMode) => void
  showLightning: boolean
  showArkade: boolean
  showBark: boolean
}

export function ReceiveModeToggle({
  mode,
  onModeChange,
  showLightning,
  showArkade,
  showBark,
}: ReceiveModeToggleProps) {
  return (
    <InfomodeWrapper
      infoId="receive-mode-toggle"
      infoComponent={ReceiveModeArkadeInfomodeContent}
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
            <ArkadeIcon className="h-5 w-5" />
            Arkade
          </button>
        ) : null}
        {showBark ? (
          <button
            type="button"
            onClick={() => onModeChange('bark')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-all',
              mode === 'bark'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Dog className="h-5 w-5" aria-hidden />
            Bark
          </button>
        ) : null}
      </div>
    </InfomodeWrapper>
  )
}
