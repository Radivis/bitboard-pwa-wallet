import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'

import { designFocusClassName } from '@/components/design/design-classes'
import { cn } from '@/lib/shared/utils'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light mode', icon: Sun },
  { value: 'dark', label: 'Dark mode', icon: Moon },
  { value: 'system', label: 'System preference', icon: Monitor },
]

export function DesignThemeSwitcher() {
  const themeMode = useThemeStore((themeState) => themeState.themeMode)
  const setThemeMode = useThemeStore((themeState) => themeState.setThemeMode)

  return (
    <div
      role="group"
      aria-label="Theme"
      data-slot="design-theme-switcher"
      className="design-ui flex w-full gap-1 rounded-[24px] border border-[var(--design-drawer-divider)] bg-[var(--design-drawer-track)] p-1"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = themeMode === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            aria-label={label}
            onClick={() => setThemeMode(value)}
            className={cn(
              designFocusClassName,
              'flex h-9 min-w-0 flex-1 items-center justify-center text-[var(--design-text-regular)]',
              selected
                ? 'rounded-[20px] border border-[var(--design-nav-stroke)] bg-[var(--design-nav-background-selected)]'
                : 'rounded-[10px] border border-transparent bg-transparent',
            )}
          >
            <Icon className="size-6" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
