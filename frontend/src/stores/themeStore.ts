import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEffect } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeState {
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system']

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      setThemeMode: (mode) => set({ themeMode: mode }),
      toggleTheme: () => {
        const currentIndex = THEME_CYCLE.indexOf(get().themeMode)
        const nextIndex = (currentIndex + 1) % THEME_CYCLE.length
        set({ themeMode: THEME_CYCLE[nextIndex] })
      },
    }),
    { name: 'theme-storage' },
  ),
)

export function resolveTheme(themeMode: ThemeMode): ResolvedTheme {
  if (themeMode !== 'system') {
    return themeMode
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function useResolvedTheme(): ResolvedTheme {
  const themeMode = useThemeStore((state) => state.themeMode)
  return resolveTheme(themeMode)
}

/**
 * Renders nothing. Keeps `document.documentElement` class list
 * in sync with the resolved theme from Zustand.
 */
export function ThemeSynchronizer() {
  const themeMode = useThemeStore((state) => state.themeMode)

  useEffect(() => {
    function apply() {
      const resolved = resolveTheme(themeMode)
      document.documentElement.classList.toggle('dark', resolved === 'dark')
    }

    apply()

    if (themeMode !== 'system') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [themeMode])

  return null
}
