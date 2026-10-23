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
  type LucideIcon,
} from 'lucide-react'
import { designNavBarSurfaceClassName } from '@/components/design/design-drawer-chrome'
import { useBottomNavSwipe } from '@/components/design/bottom-nav-swipe'
import { DesignCompactNavButton } from '@/components/design/DesignCompactNavButton'
import {
  DesignSideDrawer,
  type DesignDrawerNavItem,
} from '@/components/design/DesignSideDrawer'
import { DesignNetworkDrawer } from '@/components/design/DesignNetworkDrawer'
import { WalletTopBar } from '@/components/WalletTopBar'
import { BarkExitSeizureBanner } from '@/components/bark/BarkExitSeizureBanner'
import { useNetworkModeSelection } from '@/hooks/useNetworkModeSelection'
import { useNetworkConnectivityStore } from '@/stores/networkConnectivityStore'
import { NearZeroSecurityBanner } from '@/components/NearZeroSecurityBanner'
import { NoMnemonicBackupBanner } from '@/components/NoMnemonicBackupBanner'
import { SecureStorageUnavailableBanner } from '@/components/SecureStorageUnavailableBanner'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { cn } from '@/lib/shared/utils'

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

/** Clears a compact section footer (60px large control plus the bar's vertical padding). */
const MAIN_BOTTOM_PADDING_WITH_NAV_CLASS = 'pb-24'

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

function isPrimaryNavItemActive(
  item: PrimaryNavItem,
  pathname: string,
  matchRoute: ReturnType<typeof useMatchRoute>,
): boolean {
  return item.isActive
    ? item.isActive(pathname)
    : !!matchRoute({ to: item.to, fuzzy: false })
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
  hidden,
  navRef,
}: {
  ariaLabel: string
  items: SectionSubNavItem[]
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
        'fixed bottom-0 left-0 right-0 z-40 motion-safe:transition-transform motion-safe:duration-200',
        designNavBarSurfaceClassName,
        hidden && 'pointer-events-none translate-y-full',
      )}
    >
      <div className="mx-auto flex w-full max-w-screen-xl items-stretch gap-2 px-2 py-2">
        {items.map((item) => {
          const isActive =
            item.kind === 'match'
              ? !!matchRoute({ to: item.to, fuzzy: false })
              : item.isActive(pathname)
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

  useEffect(() => {
    rememberNetwork(committedNetwork)
  }, [committedNetwork, rememberNetwork])

  useEffect(() => {
    setSideDrawerOpen(false)
    setNetworkDrawerOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-[var(--design-background)] text-foreground">
      <WalletTopBar
        sideDrawerOpen={sideDrawerOpen}
        networkDrawerOpen={networkDrawerOpen}
        onToggleSideDrawer={() => {
          setNetworkDrawerOpen(false)
          setSideDrawerOpen((open) => !open)
        }}
        onToggleNetworkDrawer={() => {
          setSideDrawerOpen(false)
          setNetworkDrawerOpen((open) => !open)
        }}
      />

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
      <BarkExitSeizureBanner />

      <main
        className={cn(
          'mx-auto max-w-screen-xl px-4 py-6',
          bottomNavHidden ||
          !(showWalletSubNav || showLibrarySubNav || showLabSubNav || showSettingsSubNav)
            ? undefined
            : MAIN_BOTTOM_PADDING_WITH_NAV_CLASS,
        )}
      >
        {children}
      </main>

      {!isSetupRoute && <BottomNavigationChrome hidden={bottomNavHidden} navRef={bottomNavRef} />}
    </div>
  )
}
