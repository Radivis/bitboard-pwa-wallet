import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useEffect } from 'react'
import { sqliteStorage } from '@/db/storage-adapter'
import { useWalletStore, type WalletStatus } from '@/stores/walletStore'

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
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => sqliteStorage),
    },
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
 * When true, network × address accent colors apply. Otherwise a neutral cyan palette is used
 * (no active wallet, locked, or not yet unlocked).
 */
export function isWalletThemePaletteActive(
  activeWalletId: number | null,
  walletStatus: WalletStatus,
): boolean {
  if (activeWalletId == null) {
    return false
  }
  return walletStatus === 'unlocked' || walletStatus === 'syncing'
}

/**
 * Renders nothing. Keeps `document.documentElement` class list and
 * data attributes in sync with the resolved theme, network mode, and address type.
 */
export function ThemeSynchronizer() {
  const themeMode = useThemeStore((state) => state.themeMode)
  const networkMode = useWalletStore((state) => state.networkMode)
  const addressType = useWalletStore((state) => state.addressType)
  const activeWalletId = useWalletStore((state) => state.activeWalletId)
  const walletStatus = useWalletStore((state) => state.walletStatus)

  useEffect(() => {
    function apply() {
      const resolved = resolveTheme(themeMode)
      document.documentElement.classList.toggle('dark', resolved === 'dark')
      document.documentElement.dataset.network = networkMode ?? 'testnet'
      document.documentElement.dataset.addressType = addressType ?? 'taproot'
      document.documentElement.dataset.palette = isWalletThemePaletteActive(
        activeWalletId,
        walletStatus,
      )
        ? 'wallet'
        : 'neutral'
    }

    apply()

    if (themeMode !== 'system') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [themeMode, networkMode, addressType, activeWalletId, walletStatus])

  return null
}
