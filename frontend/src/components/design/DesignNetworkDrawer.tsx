import { useEffect, useRef, type RefObject } from 'react'
import { FlaskConical } from 'lucide-react'

import { DesignNavButton } from '@/components/design/DesignNavButton'
import {
  designDrawerBackdropClassName,
  designDrawerPanelClassName,
  DrawerSectionLabel,
} from '@/components/design/design-drawer-chrome'
import { useDrawerEscape } from '@/components/design/use-drawer-escape'
import {
  DRAWER_ENTER_FROM_TOP_CLASS,
  DRAWER_EXIT_TO_TOP_CLASS,
  useDrawerPresence,
} from '@/components/design/use-drawer-presence'
import { DesignSwitch } from '@/components/design/DesignSwitch'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { cn } from '@/lib/shared/utils'
import {
  isOnlineNetwork,
  networkTargetForConnectivitySwitch,
  useNetworkConnectivityStore,
  type OfflineNetworkMode,
  type OnlineNetworkMode,
} from '@/stores/networkConnectivityStore'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { DRAWER_NETWORK_LABELS } from '@/components/design/network-drawer-labels'

export const DESIGN_NETWORK_DRAWER_ID = 'app-network-drawer'

const DRAWER_SWIPE_DISTANCE_PX = 48

/** Extra space below the top bar that still opens the network drawer. */
export const NETWORK_DRAWER_OPEN_ZONE_EXTRA_PX = 50

export function networkDrawerSwipeMode({
  open,
  startY,
  headerBottom,
  startedOnPanel,
}: {
  open: boolean
  startY: number
  headerBottom: number | null
  startedOnPanel: boolean
}): 'open' | 'close' | null {
  if (open && startedOnPanel) return 'close'
  if (open || headerBottom == null) return null
  const zoneBottom = headerBottom + NETWORK_DRAWER_OPEN_ZONE_EXTRA_PX
  return startY <= zoneBottom ? 'open' : null
}

const ONLINE_NETWORKS: OnlineNetworkMode[] = ['mainnet', 'testnet', 'signet', 'mutinynet']
const OFFLINE_NETWORKS: OfflineNetworkMode[] = ['lab', 'regtest']

const CHAIN_BADGE_STYLE: Record<NetworkMode, { mark: string; color: string; background: string }> = {
  mainnet: { mark: '₿', color: '#F7931A', background: 'rgba(247,147,26,0.15)' },
  testnet: { mark: 'T4', color: '#379C3C', background: 'rgba(35,114,39,0.15)' },
  signet: { mark: 'S', color: '#379C3C', background: 'rgba(35,114,39,0.15)' },
  mutinynet: { mark: 'M', color: '#379C3C', background: 'rgba(35,114,39,0.15)' },
  lab: { mark: '', color: '#DB2777', background: 'rgba(192,38,105,0.1)' },
  regtest: { mark: 'R', color: '#DB2777', background: 'rgba(192,38,105,0.1)' },
}

type DesignNetworkDrawerProps = {
  open: boolean
  onOpen: () => void
  onClose: () => void
  onSelectNetwork: (network: NetworkMode) => void
  isSwitching?: boolean
  statusLine?: string | null
}

export function DesignNetworkDrawer({
  open,
  onOpen,
  onClose,
  onSelectNetwork,
  isSwitching = false,
  statusLine = null,
}: DesignNetworkDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { mounted, motion } = useDrawerPresence(open)
  const committedNetwork = useWalletStore(selectCommittedNetworkMode)
  const regtestEnabled = useFeatureStore((featureState) => featureState.isRegtestModeEnabled)
  const lastOnlineNetwork = useNetworkConnectivityStore((state) => state.lastOnlineNetwork)
  const lastOfflineNetwork = useNetworkConnectivityStore((state) => state.lastOfflineNetwork)
  useNetworkDrawerSwipe({ open, panelRef, onOpen, onClose })
  useDrawerEscape(open, onClose)

  if (!mounted) return null

  const onlineSelected = isOnlineNetwork(committedNetwork)
  const offlineNetworks = regtestEnabled
    ? OFFLINE_NETWORKS
    : OFFLINE_NETWORKS.filter((network) => network !== 'regtest')

  function selectConnectivity(nextOnline: boolean) {
    if (nextOnline === onlineSelected) return
    onSelectNetwork(
      networkTargetForConnectivitySwitch({
        current: committedNetwork,
        lastOnlineNetwork,
        lastOfflineNetwork,
        regtestEnabled,
      }),
    )
  }

  return (
    <>
      <div
        data-testid="design-network-drawer-backdrop"
        className={designDrawerBackdropClassName}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={DESIGN_NETWORK_DRAWER_ID}
        role="dialog"
        aria-label="Network"
        aria-modal="false"
        aria-hidden={motion === 'exit' || undefined}
        tabIndex={-1}
        data-slot="design-network-drawer"
        data-motion={motion}
        className={cn(
          designDrawerPanelClassName,
          motion === 'enter' ? DRAWER_ENTER_FROM_TOP_CLASS : DRAWER_EXIT_TO_TOP_CLASS,
          motion === 'exit' && 'pointer-events-none',
        )}
      >
        <DesignSwitch
          aria-label="Network type"
          value={onlineSelected ? 'online' : 'offline'}
          disabled={isSwitching}
          onValueChange={(connectivity) => selectConnectivity(connectivity === 'online')}
          options={[
            { value: 'offline', label: 'Offline' },
            { value: 'online', label: 'Online' },
          ]}
        />
        <div className="flex flex-col gap-2">
          <DrawerSectionLabel>Network</DrawerSectionLabel>
          <div className="flex flex-col gap-6">
            <NetworkGroup
              networks={ONLINE_NETWORKS}
              committedNetwork={committedNetwork}
              disabled={isSwitching}
              onSelectNetwork={onSelectNetwork}
            />
            <NetworkGroup
              networks={offlineNetworks}
              committedNetwork={committedNetwork}
              disabled={isSwitching}
              onSelectNetwork={onSelectNetwork}
            />
          </div>
        </div>
        {isSwitching && statusLine ? (
          <LoadingSpinner
            text={statusLine}
            className="flex-row items-start justify-start gap-2 py-1 [&_.animate-spin]:mt-0.5 [&_.animate-spin]:h-4 [&_.animate-spin]:w-4 [&_p]:text-left [&_p]:leading-snug"
          />
        ) : null}
      </div>
    </>
  )
}

export function NetworkChainBadge({
  network,
  size,
}: {
  network: NetworkMode
  size: 'header' | 'row'
}) {
  const badge = CHAIN_BADGE_STYLE[network]
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none',
        size === 'header' ? 'size-10 text-[20px]' : 'size-6 text-[15px]',
      )}
      style={{ backgroundColor: badge.background, color: badge.color }}
    >
      {network === 'lab' ? (
        <FlaskConical className={size === 'header' ? 'size-6' : 'size-5'} />
      ) : (
        badge.mark
      )}
    </span>
  )
}

function NetworkGroup({
  networks,
  committedNetwork,
  disabled,
  onSelectNetwork,
}: {
  networks: NetworkMode[]
  committedNetwork: NetworkMode
  disabled: boolean
  onSelectNetwork: (network: NetworkMode) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {networks.map((network) => (
        <DesignNavButton
          key={network}
          status={committedNetwork === network ? 'selected' : 'default'}
          className="w-full justify-start"
          disabled={disabled}
          onClick={() => onSelectNetwork(network)}
        >
          <NetworkChainBadge network={network} size="row" />
          {DRAWER_NETWORK_LABELS[network]}
        </DesignNavButton>
      ))}
    </div>
  )
}

function useNetworkDrawerSwipe({
  open,
  panelRef,
  onOpen,
  onClose,
}: {
  open: boolean
  panelRef: RefObject<HTMLDivElement | null>
  onOpen: () => void
  onClose: () => void
}) {
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  onOpenRef.current = onOpen
  onCloseRef.current = onClose

  useEffect(() => {
    let gesture: { startX: number; startY: number; pointerId: number; mode: 'open' | 'close' } | null =
      null

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return
      gesture = gestureForNetworkPointerDown(event, open, panelRef.current)
    }

    function handlePointerUp(event: PointerEvent) {
      if (gesture == null || gesture.pointerId !== event.pointerId) return
      const completedGesture = gesture
      gesture = null
      applyNetworkDrawerSwipe(completedGesture, event, onOpenRef.current, onCloseRef.current)
    }

    function handlePointerCancel(event: PointerEvent) {
      if (gesture?.pointerId === event.pointerId) gesture = null
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [open, panelRef])
}

function gestureForNetworkPointerDown(
  event: PointerEvent,
  open: boolean,
  panel: HTMLDivElement | null,
) {
  const target = event.target
  const startedOnPanel = panel != null && target instanceof Node && panel.contains(target)
  const mode = networkDrawerSwipeMode({
    open,
    startY: event.clientY,
    headerBottom: appHeaderBottom(),
    startedOnPanel,
  })
  if (mode == null) return null
  return { startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, mode }
}

function appHeaderBottom(): number | null {
  const networkButton = document.querySelector(`[aria-controls="${DESIGN_NETWORK_DRAWER_ID}"]`)
  const header = networkButton?.closest('header')
  if (header == null) return null
  return header.getBoundingClientRect().bottom
}

function applyNetworkDrawerSwipe(
  gesture: { startX: number; startY: number; mode: 'open' | 'close' },
  event: PointerEvent,
  onOpen: () => void,
  onClose: () => void,
) {
  const deltaX = event.clientX - gesture.startX
  const deltaY = event.clientY - gesture.startY
  const verticalSwipe = Math.abs(deltaY) >= DRAWER_SWIPE_DISTANCE_PX && Math.abs(deltaY) > Math.abs(deltaX)
  if (!verticalSwipe) return
  if (gesture.mode === 'open' && deltaY > 0) onOpen()
  if (gesture.mode === 'close' && deltaY < 0) onClose()
}
