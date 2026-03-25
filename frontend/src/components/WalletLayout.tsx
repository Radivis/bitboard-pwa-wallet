import { type ReactNode } from 'react'
import { Link, useMatchRoute, useLocation } from '@tanstack/react-router'
import {
  Home,
  ArrowDownLeft,
  ArrowUpRight,
  Settings,
  Wallet,
  FlaskConical,
  BookOpen,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

interface WalletLayoutProps {
  children: ReactNode
}

interface PrimaryNavItem {
  to: string
  label: string
  icon: LucideIcon
  /** When set, active when this returns true instead of strict route match */
  isActive?: (pathname: string) => boolean
}

interface WalletSubNavItem {
  to: string
  label: string
  icon: LucideIcon
}

const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  {
    to: '/wallet',
    label: 'Wallet',
    icon: Wallet,
    isActive: (pathname) => isWalletSectionPath(pathname),
  },
  {
    to: '/lab',
    label: 'Lab',
    icon: FlaskConical,
    isActive: (pathname) => pathname.startsWith('/lab'),
  },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const WALLET_SUB_NAV_ITEMS: WalletSubNavItem[] = [
  { to: '/wallet', label: 'Dashboard', icon: Home },
  { to: '/wallet/send', label: 'Send', icon: ArrowUpRight },
  { to: '/wallet/receive', label: 'Receive', icon: ArrowDownLeft },
  { to: '/wallet/management', label: 'Management', icon: SlidersHorizontal },
]

const NAV_SURFACE_CLASS =
  'border-border bg-header/95 backdrop-blur supports-[backdrop-filter]:bg-header/80'

function isWalletSectionPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/wallet')
}

const NAV_LINK_CLASS =
  'group flex min-h-0 flex-1 items-center justify-center py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function navItemInnerClassNames(isActive: boolean) {
  return cn(
    'inline-flex flex-col items-center gap-1 rounded-md px-2 py-1 text-xs transition-[color,box-shadow,ring]',
    isActive
      ? cn(
          'font-medium text-primary',
          'ring-1 ring-primary/45',
          'shadow-[0_0_16px_-3px_color-mix(in_hsl,var(--primary)_50%,transparent)]',
        )
      : 'text-muted-foreground group-hover:text-foreground',
  )
}

function PrimarySectionNav() {
  const matchRoute = useMatchRoute()
  const location = useLocation()
  const pathname = location.pathname

  return (
    <nav
      aria-label="Main sections"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 border-t',
        NAV_SURFACE_CLASS,
      )}
    >
      <div className="mx-auto flex h-16 max-w-screen-xl items-stretch justify-around px-2">
        {PRIMARY_NAV_ITEMS.map(({ to, label, icon: Icon, isActive: customActive }) => {
          const isActive = customActive
            ? customActive(pathname)
            : !!matchRoute({ to, fuzzy: false })

          return (
            <Link
              key={to}
              to={to}
              className={NAV_LINK_CLASS}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={navItemInnerClassNames(isActive)}>
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span>{label}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function WalletSubNav() {
  const matchRoute = useMatchRoute()

  return (
    <nav
      aria-label="Wallet"
      className={cn(
        'fixed bottom-16 left-0 right-0 z-40 border-t',
        NAV_SURFACE_CLASS,
      )}
    >
      <div className="mx-auto flex h-14 max-w-screen-xl items-stretch justify-around px-2">
        {WALLET_SUB_NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = !!matchRoute({ to, fuzzy: false })

          return (
            <Link
              key={to}
              to={to}
              className={NAV_LINK_CLASS}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={navItemInnerClassNames(isActive)}>
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span>{label}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function BottomNavigationChrome() {
  const location = useLocation()
  const showWalletSubNav = isWalletSectionPath(location.pathname)

  return (
    <>
      {showWalletSubNav && <WalletSubNav />}
      <PrimarySectionNav />
    </>
  )
}

export function WalletLayout({ children }: WalletLayoutProps) {
  const location = useLocation()
  const isSetupRoute = location.pathname.startsWith('/setup')
  const showWalletSubNav = !isSetupRoute && isWalletSectionPath(location.pathname)

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

      <main
        className={cn(
          'mx-auto max-w-screen-xl px-4 py-6',
          !isSetupRoute && (showWalletSubNav ? 'pb-[7.5rem]' : 'pb-20'),
        )}
      >
        {children}
      </main>

      {!isSetupRoute && <BottomNavigationChrome />}
    </div>
  )
}
