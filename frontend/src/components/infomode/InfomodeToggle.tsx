import { Lightbulb, LightbulbOff } from 'lucide-react'
import { toast } from 'sonner'
import { useInfomodeStore } from '@/stores/infomodeStore'
import { cn } from '@/lib/utils'

const INFO_MODE_TOGGLE_TOAST_DURATION_MS = 6_000

interface InfomodeToggleProps {
  /** Extra classes for the toggle button (e.g. larger hit target in modals). */
  className?: string
}

export function InfomodeToggle({ className }: InfomodeToggleProps) {
  const isActive = useInfomodeStore((state) => state.isActive)
  const toggleInfomode = useInfomodeStore((state) => state.toggleInfomode)

  return (
    <button
      type="button"
      onClick={() => {
        const willBeActive = !isActive
        toggleInfomode()
        if (willBeActive) {
          toast.message('Infomode on', {
            description:
              'Anything with a cyan border is an explainer zone—tap it to read what that part of the app does. (Taps there open help instead of the control underneath.)',
            duration: INFO_MODE_TOGGLE_TOAST_DURATION_MS,
          })
        } else {
          toast.message('Infomode off', {
            description: 'Normal behavior is back: buttons, links, and fields respond the usual way when you tap them.',
            duration: INFO_MODE_TOGGLE_TOAST_DURATION_MS,
          })
        }
      }}
      aria-pressed={isActive}
      aria-label={isActive ? 'Turn off infomode' : 'Turn on infomode'}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive ? 'text-cyan-500' : 'text-muted-foreground',
        className,
      )}
    >
      {isActive ? <Lightbulb className="h-5 w-5" /> : <LightbulbOff className="h-5 w-5" />}
    </button>
  )
}
