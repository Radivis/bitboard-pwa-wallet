import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { Link, useMatchRoute, useLocation } from '@tanstack/react-router'
import {
  Home,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Settings,
  Settings2,
  Shield,
  Sparkles,
  Info,
  Wallet,
  FlaskConical,
  BookOpen,
  SlidersHorizontal,
  List,
  Tags,
  Star,
  History,
  Blocks,
  Zap,
  Menu,
  type LucideIcon,
} from 'lucide-react'
import { DesignAppLogo } from '@/components/design/DesignAppLogo'
import { useBottomNavSwipe } from '@/components/design/bottom-nav-swipe'
import { DesignCompactNavButton } from '@/components/design/DesignCompactNavButton'
import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
import {
  DesignSideDrawer,
  DESIGN_SIDE_DRAWER_ID,
  type DesignDrawerNavItem,
} from '@/components/design/DesignSideDrawer'
import {
  DesignNetworkDrawer,
  DESIGN_NETWORK_DRAWER_ID,
  NetworkChainBadge,
} from '@/components/design/DesignNetworkDrawer'
import { DRAWER_NETWORK_LABELS } from '@/components/design/network-drawer-labels'
import { useNetworkModeSelection } from '@/hooks/useNetworkModeSelection'
import { useNetworkConnectivityStore } from '@/stores/networkConnectivityStore'
import { NearZeroSecurityBanner } from '@/components/NearZeroSecurityBanner'
import { NoMnemonicBackupBanner } from '@/components/NoMnemonicBackupBanner'
import { SecureStorageUnavailableBanner } from '@/components/SecureStorageUnavailableBanner'
import { useWallet } from '@/db'
import { selectCommittedNetworkMode, useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { cn } from '@/lib/shared/utils'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

const APP_TITLE = 'Bitcoin Codex'

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
    to: '/lab/blocks',
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
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    isActive: (pathname) => pathname.startsWith('/settings'),
  },
]

type SectionSubNavItem =
  | {
      kind: 'match'
      to: string
      label: string
      icon: LucideIcon
      linkPreload?: false
    }
  | {
      kind: 'pathname'
      to: string
      label: string
      icon: LucideIcon
      isActive: (pathname: string) => boolean
      linkPreload?: false
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

const SETTINGS_SUB_NAV_ITEMS: SectionSubNavItem[] = [
  {
    kind: 'pathname',
    to: '/settings',
    label: 'Main',
    icon: Settings2,
    isActive: (pathname) =>
      pathname === '/settings' || pathname === '/settings/',
  },
  {
    kind: 'pathname',
    to: '/settings/security',
    label: 'Security',
    icon: Shield,
    isActive: (pathname) => pathname === '/settings/security',
  },
  {
    kind: 'pathname',
    to: '/settings/features',
    label: 'Features',
    icon: Sparkles,
    isActive: (pathname) => pathname === '/settings/features',
  },
  {
    kind: 'pathname',
    to: '/settings/about',
    label: 'About',
    icon: Info,
    isActive: (pathname) => pathname === '/settings/about',
  },
]

const LAB_SUB_NAV_ITEMS: SectionSubNavItem[] = [
  {
    kind: 'pathname',
    to: '/lab/blocks',
    label: 'Blocks',
    icon: Blocks,
    linkPreload: false,
    isActive: (pathname) =>
      pathname === '/lab/blocks' ||
      pathname === '/lab' ||
      pathname === '/lab/',
  },
  {
    kind: 'pathname',
    to: '/lab/transactions',
    label: 'Transactions',
    icon: ArrowLeftRight,
    linkPreload: false,
    isActive: (pathname) => pathname === '/lab/transactions',
  },
  {
    kind: 'pathname',
    to: '/lab/layer-2',
    label: 'Layer 2',
    icon: Zap,
    linkPreload: false,
    isActive: (pathname) => pathname === '/lab/layer-2',
  },
  {
    kind: 'pathname',
    to: '/lab/control',
    label: 'Control',
    icon: SlidersHorizontal,
    linkPreload: false,
    isActive: (pathname) => pathname === '/lab/control',
  },
]

const BOTTOM_NAV_SURFACE_CLASS =
  'border-border bg-[var(--design-elevation-drawer)]'

/** Bottom nav item labels: narrow screens truncate past ~14 character widths. */
const BOTTOM_NAV_LABEL_SPAN_CLASS =
  'max-w-[14ch] truncate text-center leading-tight'

/** Section footer height for Library, Lab, and Settings (`h-14`). */
const SECTION_SUB_NAV_HEIGHT_CLASS = 'h-14'

/** Clears the compact wallet footer (68px control plus the bar's vertical padding). */
const MAIN_BOTTOM_PADDING_WALLET_SECTION_CLASS = 'pb-24'

/** Clears a single section footer (`h-14` plus a small scroll inset). */
const MAIN_BOTTOM_PADDING_SECTION_CLASS = 'pb-20'

function isWalletSectionPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/wallet')
}

function isLibrarySectionPath(pathname: string): boolean {
  return pathname.startsWith('/library')
}

function isLabSectionPath(pathname: string): boolean {
  return pathname.startsWith('/lab')
}

function isSettingsSectionPath(pathname: string): boolean {
  return pathname.startsWith('/settings')
}

const NAV_LINK_CLASS =
  'group flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function navItemInnerClassNames(isActive: boolean) {
  return cn(
    'inline-flex w-max min-w-0 max-w-full flex-col items-center gap-1 rounded-md px-1 py-1 text-xs transition-[color,box-shadow,ring] sm:px-2',
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
        <span className={BOTTOM_NAV_LABEL_SPAN_CLASS}>{label}</span>
      </span>
    </Link>
  )
}

function isPrimaryNavItemActive(
  item: PrimaryNavItem,
  pathname: string,
  matchRoute: ReturnType<typeof useMatchRoute>,
): boolean {
  return item.isActive
    ? item.isActive(pathname)
    : !!matchRoute({ to: item.to, fuzzy: false })
}

function NetworkBadgeButton({
  network,
  expanded,
  onClick,
}: {
  network: NetworkMode
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`Network, ${DRAWER_NETWORK_LABELS[network]}`}
      aria-expanded={expanded}
      aria-controls={DESIGN_NETWORK_DRAWER_ID}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <NetworkChainBadge network={network} size="header" />
    </button>
  )
}

function AppMenuButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Menu"
      aria-expanded={expanded}
      aria-controls={DESIGN_SIDE_DRAWER_ID}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Menu className="h-6 w-6" aria-hidden />
    </button>
  )
}

function buildDrawerNavItems(
  pathname: string,
  matchRoute: ReturnType<typeof useMatchRoute>,
): DesignDrawerNavItem[] {
  return PRIMARY_NAV_ITEMS.map((item) => ({
    to: item.to,
    label: item.label,
    icon: item.icon,
    selected: isPrimaryNavItemActive(item, pathname, matchRoute),
    linkPreload: item.linkPreload,
  }))
}

function SectionSubNav({
  ariaLabel,
  items,
  compact = false,
  hidden,
  navRef,
}: {
  ariaLabel: string
  items: SectionSubNavItem[]
  compact?: boolean
  hidden: boolean
  navRef: RefObject<HTMLElement | null>
}) {
  const matchRoute = useMatchRoute()
  const location = useLocation()
  const pathname = location.pathname

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      aria-hidden={hidden}
      inert={hidden || undefined}
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 border-t motion-safe:transition-transform motion-safe:duration-200',
        BOTTOM_NAV_SURFACE_CLASS,
        hidden && 'pointer-events-none translate-y-full',
      )}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-screen-xl items-stretch px-2',
          compact ? 'flex gap-2 py-2' : cn('grid', SECTION_SUB_NAV_HEIGHT_CLASS),
        )}
        style={
          compact
            ? undefined
            : { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }
        }
      >
        {items.map((item) => {
          const isActive =
            item.kind === 'match'
              ? !!matchRoute({ to: item.to, fuzzy: false })
              : item.isActive(pathname)
          if (compact) {
            const Icon = item.icon
            return (
              <DesignCompactNavButton
                key={item.to}
                asChild
                status={isActive ? 'selected' : 'default'}
                className="min-w-0 flex-1"
              >
                <Link to={item.to} preload={item.linkPreload}>
                  <Icon aria-hidden />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </DesignCompactNavButton>
            )
          }
          return (
            <BottomNavLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              isActive={isActive}
              preload={item.linkPreload}
            />
          )
        })}
      </div>
    </nav>
  )
}

function BottomNavigationChrome({
  hidden,
  navRef,
}: {
  hidden: boolean
  navRef: RefObject<HTMLElement | null>
}) {
  const location = useLocation()
  const showLibrarySubNav = isLibrarySectionPath(location.pathname)
  const showWalletSubNav = isWalletSectionPath(location.pathname)
  const showLabSubNav = isLabSectionPath(location.pathname)
  const showSettingsSubNav = isSettingsSectionPath(location.pathname)

  return (
    <>
      {showLibrarySubNav && (
        <SectionSubNav ariaLabel="Library" items={LIBRARY_SUB_NAV_ITEMS} hidden={hidden} navRef={navRef} />
      )}
      {showWalletSubNav && (
        <SectionSubNav
          ariaLabel="Wallet"
          items={WALLET_SUB_NAV_ITEMS}
          compact
          hidden={hidden}
          navRef={navRef}
        />
      )}
      {showLabSubNav && (
        <SectionSubNav ariaLabel="Lab" items={LAB_SUB_NAV_ITEMS} hidden={hidden} navRef={navRef} />
      )}
      {showSettingsSubNav && (
        <SectionSubNav
          ariaLabel="Settings"
          items={SETTINGS_SUB_NAV_ITEMS}
          hidden={hidden}
          navRef={navRef}
        />
      )}
    </>
  )
}

export function WalletLayout({ children }: WalletLayoutProps) {
  const location = useLocation()
  const matchRoute = useMatchRoute()
  const [sideDrawerOpen, setSideDrawerOpen] = useState(false)
  const [networkDrawerOpen, setNetworkDrawerOpen] = useState(false)
  const [bottomNavHidden, setBottomNavHidden] = useState(false)
  const bottomNavRef = useRef<HTMLElement>(null)
  useBottomNavSwipe(bottomNavRef, setBottomNavHidden)
  const committedNetwork = useWalletStore(selectCommittedNetworkMode)
  const rememberNetwork = useNetworkConnectivityStore((state) => state.rememberNetwork)
  const { selectNetwork, isSwitching, statusLine, unlockDialog } = useNetworkModeSelection()
  const isSetupRoute = location.pathname.startsWith('/setup')
  const showLibrarySubNav = !isSetupRoute && isLibrarySectionPath(location.pathname)
  const showWalletSubNav = !isSetupRoute && isWalletSectionPath(location.pathname)
  const showLabSubNav = !isSetupRoute && isLabSectionPath(location.pathname)
  const showSettingsSubNav = !isSetupRoute && isSettingsSectionPath(location.pathname)

  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const { data: activeWalletRow, isSuccess: activeWalletLoaded } = useWallet(activeWalletId)
  const walletDisplayName =
    activeWalletId && activeWalletLoaded && activeWalletRow?.name
      ? activeWalletRow.name
      : null
  const showWalletSuffix = Boolean(walletDisplayName)
  /** Same signal as network unlock: `walletStatus` is not persisted, so use session. */
  const walletSuffixMuted =
    activeWalletId !== null && !walletIsUnlockedOrSyncing(walletStatus)

  useEffect(() => {
    document.title =
      walletDisplayName !== null ? `${APP_TITLE}: ${walletDisplayName}` : APP_TITLE
  }, [walletDisplayName])

  useEffect(() => {
    rememberNetwork(committedNetwork)
  }, [committedNetwork, rememberNetwork])

  useEffect(() => {
    setSideDrawerOpen(false)
    setNetworkDrawerOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-[var(--design-background)] text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-[var(--design-elevation-drawer)]">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
          <h1 className="flex min-w-0 max-w-full items-center gap-2 text-lg font-semibold tracking-tight">
            <DesignAppLogo />
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
            <NetworkBadgeButton
              network={committedNetwork}
              expanded={networkDrawerOpen}
              onClick={() => {
                setSideDrawerOpen(false)
                setNetworkDrawerOpen((open) => !open)
              }}
            />
            <InfomodeToggle />
            <AppMenuButton
              expanded={sideDrawerOpen}
              onClick={() => {
                setNetworkDrawerOpen(false)
                setSideDrawerOpen((open) => !open)
              }}
            />
          </div>
        </div>
      </header>

      <DesignSideDrawer
        open={sideDrawerOpen}
        onOpen={() => {
          setNetworkDrawerOpen(false)
          setSideDrawerOpen(true)
        }}
        onClose={() => setSideDrawerOpen(false)}
        navItems={buildDrawerNavItems(location.pathname, matchRoute)}
      />
      <DesignNetworkDrawer
        open={networkDrawerOpen}
        onOpen={() => {
          setSideDrawerOpen(false)
          setNetworkDrawerOpen(true)
        }}
        onClose={() => setNetworkDrawerOpen(false)}
        onSelectNetwork={selectNetwork}
        isSwitching={isSwitching}
        statusLine={statusLine}
      />
      {unlockDialog}

      <SecureStorageUnavailableBanner />
      <NearZeroSecurityBanner />
      <NoMnemonicBackupBanner />

      <main
        className={cn(
          'mx-auto max-w-screen-xl px-4 py-6',
          bottomNavHidden
            ? undefined
            : showWalletSubNav
              ? MAIN_BOTTOM_PADDING_WALLET_SECTION_CLASS
              : showLibrarySubNav || showLabSubNav || showSettingsSubNav
                ? MAIN_BOTTOM_PADDING_SECTION_CLASS
                : undefined,
        )}
      >
        {children}
      </main>

      {!isSetupRoute && <BottomNavigationChrome hidden={bottomNavHidden} navRef={bottomNavRef} />}
    </div>
  )
}
