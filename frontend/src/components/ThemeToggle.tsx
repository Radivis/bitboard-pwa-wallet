import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import { cn } from '@/lib/utils'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light mode', icon: Sun },
  { value: 'dark', label: 'Dark mode', icon: Moon },
  { value: 'system', label: 'System preference', icon: Monitor },
]

export function ThemeToggle() {
  const themeMode = useThemeStore((state) => state.themeMode)
  const setThemeMode = useThemeStore((state) => state.setThemeMode)

  const activeIndex = THEME_OPTIONS.findIndex((opt) => opt.value === themeMode)

  return (
    <div
      role="group"
      aria-label="Theme selection"
      className="flex min-w-[4.5rem] flex-col items-center gap-1"
    >
      <div className="grid w-full grid-cols-3">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setThemeMode(value)}
            aria-pressed={themeMode === value}
            aria-label={label}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-1 rounded-md transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              themeMode === value ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div className="relative h-1 w-full rounded-full bg-muted">
        <div
          className="absolute top-0 left-0 h-1 rounded-full bg-primary transition-transform duration-200 ease-out"
          style={{
            width: '33.333%',
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
      </div>
    </div>
  )
}
