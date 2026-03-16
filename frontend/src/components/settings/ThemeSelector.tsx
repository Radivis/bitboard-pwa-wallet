import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import { Button } from '@/components/ui/button'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeSelector() {
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)

  return (
    <div className="flex flex-wrap gap-2">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={themeMode === value ? 'default' : 'outline'}
          size="sm"
          onClick={() => setThemeMode(value)}
          className="gap-2"
        >
          <Icon className="h-4 w-4" />
          {label}
        </Button>
      ))}
    </div>
  )
}
