import { Lightbulb, LightbulbOff } from 'lucide-react'
import { useInfomodeStore } from '@/stores/infomodeStore'
import { cn } from '@/lib/utils'

export function InfomodeToggle() {
  const isActive = useInfomodeStore((state) => state.isActive)
  const toggleInfomode = useInfomodeStore((state) => state.toggleInfomode)

  return (
    <button
      type="button"
      onClick={() => toggleInfomode()}
      aria-pressed={isActive}
      aria-label={isActive ? 'Turn off infomode' : 'Turn on infomode'}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive ? 'text-cyan-500' : 'text-muted-foreground',
      )}
    >
      {isActive ? <Lightbulb className="h-5 w-5" /> : <LightbulbOff className="h-5 w-5" />}
    </button>
  )
}
