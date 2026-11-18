import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { QrCode, Copy, RefreshCw, ArrowDownLeft } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignBanner } from '@/components/design/DesignBanner'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  AddressType,
  selectCommittedNetworkMode,
  useWalletStore,
  type NetworkMode,
} from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useFeatureStore } from '@/stores/featureStore'
import { updateWalletChangeset } from '@/lib/wallet/wallet-utils'
import { exportChangesetForPersistence } from '@/lib/wallet/lifecycle/onchain-descriptor-mutation-guard'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { ReceiveModeToggle, type ReceiveMode } from '@/components/receive/ReceiveModeToggle'
import { ReceiveQrCode } from '@/components/receive/ReceiveQrCode'
import { LightningReceive } from '@/components/receive/LightningReceive'
import { ArkadeReceive } from '@/components/receive/ArkadeReceive'
import { BarkReceive } from '@/components/receive/BarkReceive'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { ReceiveGapConfirmModal } from '@/components/receive/ReceiveGapConfirmModal'
import { ReceivePaymentCountInfomodeContent } from '@/components/receive/infomode/ReceivePaymentCountInfomodeContent'
import { ReceiveUnusedGapInfomodeContent } from '@/components/receive/infomode/ReceiveUnusedGapInfomodeContent'
import { ReceiveMainnetDemoWarningModal } from '@/components/receive/ReceiveMainnetDemoWarningModal'
import { FaucetLinker } from '@/components/receive/FaucetLinker'
import { useOnchainEsploraSyncMetadataQuery } from '@/hooks/useOnchainDashboardQueries'
import {
  chainHistoryObserved,
  confirmKindForGap,
  generateConfirmKindForClick,
  paymentsToAddressLabel,
  receiveButtonEmphasis,
  receiveGapSurface,
  type ReceiveGapConfirmKind,
} from '@/lib/wallet/receive-gap-surface'
import { walletReceivePageTitle } from '@/lib/wallet/wallet-lab-ui-copy'

export function ReceivePage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const addressType = useWalletStore((walletState) => walletState.addressType)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const setCurrentAddress = useWalletStore((walletState) => walletState.setCurrentAddress)
  const lastSyncTime = useWalletStore((walletState) => walletState.lastSyncTime)
  const getNewAddress = useCryptoStore((cryptoState) => cryptoState.getNewAddress)
  const getExternalReceiveGap = useCryptoStore((cryptoState) => cryptoState.getExternalReceiveGap)
  const onchainEsploraSyncQuery = useOnchainEsploraSyncMetadataQuery()
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const isSegwitAddressesEnabled = useFeatureStore((featureState) => featureState.isSegwitAddressesEnabled)
  const committedNetworkMode = useWalletStore(selectCommittedNetworkMode)
  const [mainnetDemoDismissed, setMainnetDemoDismissed] = useState(false)
  const [gapPromptKind, setGapPromptKind] = useState<ReceiveGapConfirmKind | null>(null)
  const [promptGap, setPromptGap] = useState(0)
  const previousCommittedNetworkModeRef = useRef<NetworkMode | null>(null)

  const search = useSearch({ from: '/wallet/receive' })
  const showLightningToggle = isLightningEnabled && isLightningSupported(networkMode)
  const showArkadeToggle = isArkadeActiveForNetworkMode(networkMode)
  const showBarkToggle = isBarkActiveForNetworkMode(networkMode)
  const showModeToggle = showLightningToggle || showArkadeToggle || showBarkToggle
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>(() =>
    search.mode === 'arkade' && isArkadeActiveForNetworkMode(networkMode) ? 'arkade' : 'bitcoin',
  )

  useEffect(() => {
    if (search.mode === 'arkade' && showArkadeToggle) {
      setReceiveMode('arkade')
    }
  }, [search.mode, showArkadeToggle])

  useEffect(() => {
    const previous = previousCommittedNetworkModeRef.current
    previousCommittedNetworkModeRef.current = committedNetworkMode
    if (
      committedNetworkMode === 'mainnet' &&
      previous !== 'mainnet'
    ) {
      setMainnetDemoDismissed(false)
    }
  }, [committedNetworkMode])

  useEffect(() => {
    if (!currentAddress && walletIsUnlockedOrSyncing(walletStatus)) {
      loadAddress()
    }

    async function loadAddress() {
      try {
        const address = await getNewAddress()
        setCurrentAddress(address)
      } catch {
        toast.error('Failed to generate address')
      }
    }
  }, [currentAddress, walletStatus, getNewAddress, setCurrentAddress])

  const showingBitcoinReceive =
    !(showLightningToggle && receiveMode === 'lightning') &&
    !(showArkadeToggle && receiveMode === 'arkade') &&
    !(showBarkToggle && receiveMode === 'bark')
  const chainObserved = chainHistoryObserved({
    networkMode,
    lastSyncTime,
    lastSuccessfulEsploraSyncAt: onchainEsploraSyncQuery.data?.lastSuccessfulEsploraSyncAt,
  })
  const receiveGapQuery = useQuery({
    queryKey: [
      'receive-external-gap',
      activeWalletId,
      currentAddress,
      networkMode,
      lastSyncTime?.toISOString() ?? null,
    ],
    queryFn: () => getExternalReceiveGap(),
    enabled:
      showingBitcoinReceive &&
      chainObserved &&
      currentAddress != null &&
      activeWalletId != null &&
      walletIsUnlockedOrSyncing(walletStatus),
  })
  const buttonEmphasis = receiveButtonEmphasis(receiveGapQuery.data?.receiveCount ?? 0)
  const gapSurface = receiveGapSurface({
    chainObserved,
    reading: receiveGapQuery.data ?? null,
  })

  const revealNextAddress = useCallback(async () => {
    try {
      const address = await getNewAddress()
      setCurrentAddress(address)

      if (activeWalletId) {
        const changesetJson = await exportChangesetForPersistence()
        await updateWalletChangeset({
          walletId: activeWalletId,
          changesetJson,
        })
      }

      toast.success('New address generated')
    } catch {
      toast.error('Failed to generate new address')
    }
  }, [getNewAddress, setCurrentAddress, activeWalletId])

  const handleGenerateClick = useCallback(async () => {
    try {
      const reading = await getExternalReceiveGap()
      const generateConfirmKind = generateConfirmKindForClick({ chainObserved, reading })
      if (generateConfirmKind === 'none') {
        await revealNextAddress()
        return
      }
      setPromptGap(reading.gap)
      setGapPromptKind(generateConfirmKind)
    } catch {
      toast.error('Failed to check the address gap')
    }
  }, [chainObserved, getExternalReceiveGap, revealNextAddress])

  const handleGapConfirm = useCallback(async () => {
    try {
      const reading = await getExternalReceiveGap()
      const nextConfirmKind = reading.revealed ? confirmKindForGap(reading.gap) : 'none'
      if (nextConfirmKind === 'none') {
        setGapPromptKind(null)
        await revealNextAddress()
        return
      }
      if (nextConfirmKind !== gapPromptKind) {
        setPromptGap(reading.gap)
        setGapPromptKind(nextConfirmKind)
        return
      }
      setGapPromptKind(null)
      await revealNextAddress()
    } catch {
      toast.error('Failed to check the address gap')
    }
  }, [gapPromptKind, getExternalReceiveGap, revealNextAddress])

  const handleCopy = useCallback(async () => {
    if (!currentAddress) return
    try {
      await navigator.clipboard.writeText(currentAddress)
      toast.success('Address copied to clipboard')
    } catch {
      toast.error('Failed to copy address')
    }
  }, [currentAddress])

  if (!activeWalletId) {
    navigate({ to: '/setup' })
    return null
  }

  const showMainnetDemoModal =
    committedNetworkMode === 'mainnet' && !mainnetDemoDismissed
  const mainnetDemoModal = (
    <ReceiveMainnetDemoWarningModal
      open={showMainnetDemoModal}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setMainnetDemoDismissed(true)
      }}
    />
  )

  const modeToggle = showModeToggle ? (
    <ReceiveModeToggle
      mode={receiveMode}
      onModeChange={setReceiveMode}
      showLightning={showLightningToggle}
      showArkade={showArkadeToggle}
      showBark={showBarkToggle}
    />
  ) : null

  if (showLightningToggle && receiveMode === 'lightning') {
    return (
      <>
        {mainnetDemoModal}
        <div className="space-y-6">
          <PageHeader title="Receive Lightning" icon={ArrowDownLeft} />
          {modeToggle}
          <LightningReceive />
        </div>
      </>
    )
  }

  if (showArkadeToggle && receiveMode === 'arkade') {
    return (
      <>
        {mainnetDemoModal}
        <div className="space-y-6">
          <PageHeader title="Receive on Arkade" icon={ArrowDownLeft} />
          {modeToggle}
          <ArkadeReceive />
        </div>
      </>
    )
  }

  if (showBarkToggle && receiveMode === 'bark') {
    return (
      <>
        {mainnetDemoModal}
        <div className="space-y-6">
          <PageHeader title="Receive on Bark" icon={ArrowDownLeft} />
          {modeToggle}
          <BarkReceive />
        </div>
      </>
    )
  }

  return (
    <>
      {mainnetDemoModal}
      <ReceiveGapConfirmModal
        open={gapPromptKind === 'soft' || gapPromptKind === 'hard'}
        kind={gapPromptKind === 'hard' ? 'hard' : 'soft'}
        gap={promptGap}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setGapPromptKind(null)
        }}
        onConfirm={handleGapConfirm}
      />
      <div className="space-y-6">
      <PageHeader title={walletReceivePageTitle(networkMode)} icon={ArrowDownLeft} />

      {modeToggle}

      <InfomodeWrapper
        infoId="receive-qr-code-card"
        infoTitle="QR code"
        infoText="This QR code only encodes the same receiving address you see below—usually as a bitcoin:… link—so someone can point a phone camera at it instead of typing. All mainstream mobile Bitcoin wallets today can scan this format and pre-fill a send screen with your address."
        className="rounded-xl"
      >
        <DesignCard>
          <DesignCardHeader>
            <div className="flex items-center justify-between">
              <DesignCardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                QR Code
              </DesignCardTitle>
              {isSegwitAddressesEnabled ? (
                <Badge variant="outline">
                  {addressType === AddressType.Taproot
                    ? 'Taproot (BIP86)'
                    : 'SegWit (BIP84)'}
                </Badge>
              ) : null}
            </div>
          </DesignCardHeader>
          <DesignCardContent>
            <div className="flex flex-col items-center gap-4">
              {currentAddress ? (
                <ReceiveQrCode value={`bitcoin:${currentAddress}`} rail="bitcoin" />
              ) : (
                <LoadingSpinner text="Generating address..." />
              )}
            </div>
          </DesignCardContent>
        </DesignCard>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="receive-receiving-address-card"
        infoTitle="Receiving address"
        infoText="The beginning of the string (the prefix) signals both the address type and which Bitcoin network it is for—mainnet and test networks use different conventions, and Taproot vs SegWit addresses look different by design. Under the hood your wallet is not inventing random strings: it derives each address in a fixed order from your single master key using standard HD-wallet rules. That means the same recovery phrase always regenerates the same sequence of addresses in any compatible wallet."
        className="rounded-xl"
      >
        <DesignCard>
          <DesignCardHeader>
            <DesignCardTitle>Receiving Address</DesignCardTitle>
          </DesignCardHeader>
          <DesignCardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="design-type-addresses flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2">
                {currentAddress || 'Generating...'}
              </div>
              <DesignButton
                appearance={buttonEmphasis.copy}
                onClick={handleCopy}
                disabled={!currentAddress}
                aria-label="Copy address"
                icon={<Copy />}
              />
            </div>
            {gapSurface.kind === 'visible' ? (
              <div className="space-y-2" data-testid="receive-gap-summary">
                <InfomodeWrapper
                  infoId="receive-payment-count"
                  infoComponent={ReceivePaymentCountInfomodeContent}
                  className="rounded-md"
                >
                  <p data-testid="receive-payment-count">
                    {paymentsToAddressLabel(gapSurface.receiveCount)}
                  </p>
                </InfomodeWrapper>
                {gapSurface.gapLabel != null ? (
                  <InfomodeWrapper
                    infoId="receive-unused-gap"
                    infoComponent={ReceiveUnusedGapInfomodeContent}
                    className="rounded-md"
                  >
                    <p data-testid="receive-unused-gap">{gapSurface.gapLabel}</p>
                  </InfomodeWrapper>
                ) : null}
                {networkMode !== 'lab' && onchainEsploraSyncQuery.data?.isStaleOnchain ? (
                  <DesignBanner
                    role="status"
                    status="warning"
                    data-testid="receive-gap-stale-banner"
                    title="Showing saved chain state"
                    description={
                      <>
                        Showing on-chain data from your wallet&apos;s saved chain state. Esplora has
                        not been verified this session.
                        {onchainEsploraSyncQuery.data.lastSuccessfulEsploraSyncAt != null ? (
                          <>
                            {' '}
                            Last verified with Esplora:{' '}
                            {new Date(
                              onchainEsploraSyncQuery.data.lastSuccessfulEsploraSyncAt,
                            ).toLocaleString()}
                            .
                          </>
                        ) : null}
                      </>
                    }
                  />
                ) : null}
              </div>
            ) : null}
            <InfomodeWrapper
              infoId="receive-generate-new-address-button"
              infoTitle="Generate new address"
              infoText="When you tap this, Bitboard advances an internal index and derives the next unused address from your wallet’s master key along the standard path for your address type (BIP86 for Taproot, BIP84 for SegWit). Nothing is “random” in the sense of losing it later: the new address is the next slot in a deterministic list, so your seed phrase can always recreate every address you have ever generated, in order. Older addresses you already shared still receive funds; generating a new one is mainly for privacy and for keeping track of separate payments."
            >
              <DesignButton
                appearance={buttonEmphasis.generate}
                className="w-full"
                onClick={handleGenerateClick}
                icon={<RefreshCw />}
              >
                Generate New Address
              </DesignButton>
            </InfomodeWrapper>
          </DesignCardContent>
        </DesignCard>
      </InfomodeWrapper>

      <FaucetLinker />
    </div>
    </>
  )
}
