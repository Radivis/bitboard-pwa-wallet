import { type ReactNode } from 'react'
import { Link, useMatchRoute, useLocation } from '@tanstack/react-router'
import { Home, ArrowDownLeft, ArrowUpRight, Settings, type LucideIcon } from 'lucide-react'
import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

interface WalletLayoutProps {
  children: ReactNode
}

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

function BottomNavigation() {
  const matchRoute = useMatchRoute()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-header/95 backdrop-blur supports-[backdrop-filter]:bg-header/80">
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
  const location = useLocation()
  const isSetupRoute = location.pathname.startsWith('/setup')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-header/95 backdrop-blur supports-[backdrop-filter]:bg-header/80">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <img
              src="/bitboard-icon.png"
              alt=""
              className="h-7 w-7 shrink-0"
              width={28}
              height={28}
            />
            Bitboard Wallet
          </h1>
          <div className="flex items-center gap-3">
            <InfomodeToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className={cn(
        'mx-auto max-w-screen-xl px-4 py-6',
        !isSetupRoute && 'pb-20',
      )}>
        {children}
      </main>

      {!isSetupRoute && <BottomNavigation />}
    </div>
  )
}
