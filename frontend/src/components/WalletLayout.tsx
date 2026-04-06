import { type ReactNode, useEffect } from 'react'
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
  List,
  Tags,
  Star,
  History,
  type LucideIcon,
} from 'lucide-react'
import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NearZeroSecurityBanner } from '@/components/NearZeroSecurityBanner'
import { useWallet } from '@/db'
import { useWalletStore } from '@/stores/walletStore'
import { cn } from '@/lib/utils'

const APP_TITLE = 'Bitboard Wallet'

interface WalletLayoutProps {
  children: ReactNode
}

interface PrimaryNavItem {
  to: string
  label: string
  icon: LucideIcon
  /** When set, active when this returns true instead of strict route match */
  isActive?: (pathname: string) => boolean
  /** e.g. false for Lab so intent preload does not run `beforeLoad` on hover */
  linkPreload?: false
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
    linkPreload: false,
  },
  {
    to: '/library',
    label: 'Library',
    icon: BookOpen,
    isActive: (pathname) => pathname.startsWith('/library'),
  },
  { to: '/settings', label: 'Settings', icon: Settings },
]

type SectionSubNavItem =
  | {
      kind: 'match'
      to: string
      label: string
      icon: LucideIcon
    }
  | {
      kind: 'pathname'
      to: string
      label: string
      icon: LucideIcon
      isActive: (pathname: string) => boolean
    }

const WALLET_SUB_NAV_ITEMS: SectionSubNavItem[] = [
  { kind: 'match', to: '/wallet', label: 'Dashboard', icon: Home },
  { kind: 'match', to: '/wallet/send', label: 'Send', icon: ArrowUpRight },
  { kind: 'match', to: '/wallet/receive', label: 'Receive', icon: ArrowDownLeft },
  { kind: 'match', to: '/wallet/management', label: 'Management', icon: SlidersHorizontal },
]

const LIBRARY_SUB_NAV_ITEMS: SectionSubNavItem[] = [
  {
    kind: 'pathname',
    to: '/library',
    label: 'Index',
    icon: List,
    isActive: (pathname) => pathname === '/library' || pathname === '/library/',
  },
  {
    kind: 'pathname',
    to: '/library/tags',
    label: 'Tags',
    icon: Tags,
    isActive: (pathname) => pathname === '/library/tags',
  },
  {
    kind: 'pathname',
    to: '/library/favorites',
    label: 'Favorites',
    icon: Star,
    isActive: (pathname) => pathname === '/library/favorites',
  },
  {
    kind: 'pathname',
    to: '/library/history',
    label: 'History',
    icon: History,
    isActive: (pathname) => pathname === '/library/history',
  },
]

const NAV_SURFACE_CLASS =
  'border-border bg-header/95 backdrop-blur supports-[backdrop-filter]:bg-header/80'

/**
 * Primary section bar (Tailwind `h-16`). Wallet sub-nav uses literal `bottom-16` in JSX
 * (same 4rem offset) so Tailwind’s scanner keeps the class; do not change one without the other.
 */
const PRIMARY_BOTTOM_NAV_HEIGHT_CLASS = 'h-16'

/** Wallet subsection bar height (`h-14`). */
const WALLET_SUB_NAV_HEIGHT_CLASS = 'h-14'

/**
 * Main content bottom padding when both fixed bars show: must match
 * WALLET_SUB_NAV_HEIGHT_CLASS + PRIMARY_BOTTOM_NAV_HEIGHT_CLASS (3.5rem + 4rem).
 */
const MAIN_BOTTOM_PADDING_WALLET_SECTION_CLASS = 'pb-[7.5rem]'

/** Main padding when only the primary bar is fixed (`h-16` + comfortable scroll inset). */
const MAIN_BOTTOM_PADDING_PRIMARY_ONLY_CLASS = 'pb-20'

function isWalletSectionPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/wallet')
}

function isLibrarySectionPath(pathname: string): boolean {
  return pathname.startsWith('/library')
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

type BottomNavLinkProps = {
  to: string
  label: string
  icon: LucideIcon
  isActive: boolean
  preload?: false
}

function BottomNavLink({
  to,
  label,
  icon: Icon,
  isActive,
  preload,
}: BottomNavLinkProps) {
  return (
    <Link
      to={to}
      preload={preload}
      className={NAV_LINK_CLASS}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className={navItemInnerClassNames(isActive)}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden />
        <span>{label}</span>
      </span>
    </Link>
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
      <div
        className={cn(
          'mx-auto flex max-w-screen-xl items-stretch justify-around px-2',
          PRIMARY_BOTTOM_NAV_HEIGHT_CLASS,
        )}
      >
        {PRIMARY_NAV_ITEMS.map(
          ({ to, label, icon, isActive: customActive, linkPreload }) => {
            const isActive = customActive
              ? customActive(pathname)
              : !!matchRoute({ to, fuzzy: false })

            return (
              <BottomNavLink
                key={to}
                to={to}
                label={label}
                icon={icon}
                isActive={isActive}
                preload={linkPreload}
              />
            )
          },
        )}
      </div>
    </nav>
  )
}

function SectionSubNav({
  ariaLabel,
  items,
}: {
  ariaLabel: string
  items: SectionSubNavItem[]
}) {
  const matchRoute = useMatchRoute()
  const location = useLocation()
  const pathname = location.pathname

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'fixed bottom-16 left-0 right-0 z-40 border-t',
        NAV_SURFACE_CLASS,
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-screen-xl items-stretch justify-around px-2',
          WALLET_SUB_NAV_HEIGHT_CLASS,
        )}
      >
        {items.map((item) => {
          const isActive =
            item.kind === 'match'
              ? !!matchRoute({ to: item.to, fuzzy: false })
              : item.isActive(pathname)
          return (
            <BottomNavLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              isActive={isActive}
            />
          )
        })}
      </div>
    </nav>
  )
}

function BottomNavigationChrome() {
  const location = useLocation()
  const showLibrarySubNav = isLibrarySectionPath(location.pathname)
  const showWalletSubNav = isWalletSectionPath(location.pathname)

  return (
    <>
      {showLibrarySubNav && (
        <SectionSubNav ariaLabel="Library" items={LIBRARY_SUB_NAV_ITEMS} />
      )}
      {showWalletSubNav && (
        <SectionSubNav ariaLabel="Wallet" items={WALLET_SUB_NAV_ITEMS} />
      )}
      <PrimarySectionNav />
    </>
  )
}

export function WalletLayout({ children }: WalletLayoutProps) {
  const location = useLocation()
  const isSetupRoute = location.pathname.startsWith('/setup')
  const showLibrarySubNav = !isSetupRoute && isLibrarySectionPath(location.pathname)
  const showWalletSubNav = !isSetupRoute && isWalletSectionPath(location.pathname)

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const { data: activeWalletRow, isSuccess: activeWalletLoaded } = useWallet(activeWalletId)
  const walletDisplayName =
    activeWalletId && activeWalletLoaded && activeWalletRow?.name
      ? activeWalletRow.name
      : null
  const showWalletSuffix = Boolean(walletDisplayName)
  const walletSuffixMuted = walletStatus === 'locked'

  useEffect(() => {
    document.title =
      walletDisplayName !== null ? `${APP_TITLE}: ${walletDisplayName}` : APP_TITLE
  }, [walletDisplayName])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-header/95 backdrop-blur supports-[backdrop-filter]:bg-header/80">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
          <h1 className="flex min-w-0 max-w-full items-center gap-2 text-lg font-semibold tracking-tight">
            <img
              src="/bitboard-icon.png"
              alt=""
              className="h-7 w-7 shrink-0"
              width={28}
              height={28}
            />
            <span className="min-w-0 truncate">
              {APP_TITLE}
              {showWalletSuffix && walletDisplayName !== null && (
                <span
                  className={cn(walletSuffixMuted && 'opacity-40')}
                  title={walletDisplayName}
                >
                  :&nbsp;{walletDisplayName}
                </span>
              )}
            </span>
          </h1>
          <div className="flex items-center gap-3">
            <InfomodeToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <NearZeroSecurityBanner />

      <main
        className={cn(
          'mx-auto max-w-screen-xl px-4 py-6',
          !isSetupRoute &&
            (showWalletSubNav || showLibrarySubNav
              ? MAIN_BOTTOM_PADDING_WALLET_SECTION_CLASS
              : MAIN_BOTTOM_PADDING_PRIMARY_ONLY_CLASS),
        )}
      >
        {children}
      </main>

      {!isSetupRoute && <BottomNavigationChrome />}
    </div>
  )
}
