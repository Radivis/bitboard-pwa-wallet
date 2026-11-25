import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'

import { DesignSwitch } from '@/components/design/DesignSwitch'
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
    <DesignSwitch
      aria-label="Theme"
      value={themeMode}
      onValueChange={setThemeMode}
      options={THEME_OPTIONS.map(({ value, label, icon: Icon }) => ({
        value,
        label,
        icon: <Icon aria-hidden />,
      }))}
    />
  )
}
