import { type ReactNode } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { Home, ArrowDownLeft, ArrowUpRight, Settings, Sun, Moon, Monitor, type LucideIcon } from 'lucide-react'
import { useThemeStore, useResolvedTheme } from '@/stores/themeStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WalletLayoutProps {
  children: ReactNode
}

const NEXT_THEME_ICON = {
  light: Moon,
  dark: Monitor,
  system: Sun,
} as const

const THEME_CYCLE_LABELS = { light: 'dark', dark: 'system', system: 'light' } as const

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/receive', label: 'Receive', icon: ArrowDownLeft },
  { to: '/send', label: 'Send', icon: ArrowUpRight },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function WalletThemeToggle() {
  const themeMode = useThemeStore((state) => state.themeMode)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const resolvedTheme = useResolvedTheme()

  const Icon = NEXT_THEME_ICON[themeMode]

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${THEME_CYCLE_LABELS[themeMode]} mode (currently ${themeMode}${themeMode === 'system' ? `, resolved: ${resolvedTheme}` : ''})`}
    >
      <Icon className="h-5 w-5" />
    </Button>
  )
}

function BottomNavigation() {
  const matchRoute = useMatchRoute()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-around px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = !!matchRoute({ to, fuzzy: false })

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors',
                isActive
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function WalletLayout({ children }: WalletLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
          <h1 className="text-lg font-semibold tracking-tight">
            Bitboard Wallet
          </h1>
          <WalletThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-6 pb-20">
        {children}
      </main>

      <BottomNavigation />
    </div>
  )
}
