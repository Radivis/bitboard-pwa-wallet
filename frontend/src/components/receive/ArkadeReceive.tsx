import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Copy, Loader2, QrCode, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { ArkadeAddressInfomodeContent } from '@/components/arkade/infomode/ArkadeAddressInfomodeContent'
import { ArkadeReceivePaymentCountInfomodeContent } from '@/components/arkade/infomode/ArkadeReceivePaymentCountInfomodeContent'
import { ArkadeReceiveUnusedGapInfomodeContent } from '@/components/arkade/infomode/ArkadeReceiveUnusedGapInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { ReceiveGapConfirmModal } from '@/components/receive/ReceiveGapConfirmModal'
import { ReceiveQrCode } from '@/components/receive/ReceiveQrCode'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_HARD_GAP_OPT_IN_LABEL,
  arkadeCurrentAddressRestoreWarning,
  arkadeCurrentIndexMissesRestore,
  arkadeGenerateConfirmKind,
  arkadeHardGapConfirmBody,
  arkadePaymentCountLabel,
  arkadeReceiveGapSurface,
  arkadeSoftGapConfirmBody,
} from '@/lib/arkade/arkade-receive-gap-surface'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import {
  readArkadeOffchainReceiveGap,
  useArkadeAddressQuery,
  useArkadeBalanceQuery,
  useArkadeNewAddressMutation,
  useArkadeOffchainReceiveGapQuery,
} from '@/hooks/useArkadeQueries'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { ReceiveGapConfirmKind } from '@/lib/wallet/receive-gap-surface'

export function ArkadeReceive() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const storeReceiveAddress = useWalletStore((walletState) => walletState.arkadeReceiveAddress)
  const addressQuery = useArkadeAddressQuery()
  const newAddressMutation = useArkadeNewAddressMutation()
  const [gapPromptKind, setGapPromptKind] = useState<ReceiveGapConfirmKind | null>(null)
  const [promptGap, setPromptGap] = useState(0)
  const [checkingGap, setCheckingGap] = useState(false)
  // Poll balance (and run WASM key discovery) while the user waits on Receive.
  useArkadeBalanceQuery()

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <p className="design-type-regular text-muted-foreground">
        Enable Arkade under Settings → Features and select a supported network (mainnet
        or signet).{' '}
        <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
          Open settings
        </Link>
      </p>
    )
  }

  const address = storeReceiveAddress ?? addressQuery.data ?? ''
  return (
    <ArkadeReceiveAddress
      address={address}
      addressLoading={
        storeReceiveAddress == null &&
        (addressQuery.isLoading || (addressQuery.isFetching && address.length === 0))
      }
      addressError={addressQuery.isError}
      revealPending={newAddressMutation.isPending || checkingGap}
      gapPromptKind={gapPromptKind}
      promptGap={promptGap}
      onPromptOpenChange={(nextOpen) => {
        if (!nextOpen) setGapPromptKind(null)
      }}
      onCopy={async () => {
        if (!address) return
        try {
          await navigator.clipboard.writeText(address)
          toast.success('Arkade address copied')
        } catch {
          toast.error('Failed to copy address')
        }
      }}
      onGenerate={async () => {
        setCheckingGap(true)
        try {
          const reading = await readArkadeOffchainReceiveGap()
          const confirmKind = arkadeGenerateConfirmKind(reading)
          if (confirmKind === 'none') {
            await newAddressMutation.mutateAsync()
            return
          }
          setPromptGap(reading.gap)
          setGapPromptKind(confirmKind)
        } catch {
          toast.error('Failed to check the address gap')
        } finally {
          setCheckingGap(false)
        }
      }}
      onConfirm={async () => {
        try {
          const reading = await readArkadeOffchainReceiveGap()
          const nextConfirmKind = arkadeGenerateConfirmKind(reading)
          if (nextConfirmKind === 'none') {
            setGapPromptKind(null)
            await newAddressMutation.mutateAsync()
            return
          }
          if (nextConfirmKind !== gapPromptKind) {
            setPromptGap(reading.gap)
            setGapPromptKind(nextConfirmKind)
            return
          }
          setGapPromptKind(null)
          await newAddressMutation.mutateAsync()
        } catch {
          toast.error('Failed to check the address gap')
        }
      }}
    />
  )
}

function ArkadeReceiveAddress({
  address,
  addressLoading,
  addressError,
  revealPending,
  gapPromptKind,
  promptGap,
  onPromptOpenChange,
  onCopy,
  onGenerate,
  onConfirm,
}: {
  address: string
  addressLoading: boolean
  addressError: boolean
  revealPending: boolean
  gapPromptKind: ReceiveGapConfirmKind | null
  promptGap: number
  onPromptOpenChange: (open: boolean) => void
  onCopy: () => Promise<void>
  onGenerate: () => Promise<void>
  onConfirm: () => Promise<void>
}) {
  const gapQuery = useArkadeOffchainReceiveGapQuery(address)
  const gapReading = gapQuery.data ?? null
  const gapSurface = arkadeReceiveGapSurface(gapReading)
  const restoreWarning =
    gapReading != null && arkadeCurrentIndexMissesRestore(gapReading)
      ? arkadeCurrentAddressRestoreWarning()
      : null
  const promptIsHard = gapPromptKind === 'hard'

  return (
    <>
      <ReceiveGapConfirmModal
        open={gapPromptKind === 'soft' || gapPromptKind === 'hard'}
        kind={promptIsHard ? 'hard' : 'soft'}
        gap={promptGap}
        body={promptIsHard ? arkadeHardGapConfirmBody() : arkadeSoftGapConfirmBody(promptGap)}
        optInLabel={ARKADE_HARD_GAP_OPT_IN_LABEL}
        dialogDescription={
          promptIsHard
            ? 'Confirm that you understand a seed restore may not find funds sent to the next address.'
            : 'Confirm generating another Arkade address while the current one has not been paid.'
        }
        onOpenChange={onPromptOpenChange}
        onConfirm={onConfirm}
      />
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Code
          </DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent>
          <div className="flex flex-col items-center gap-4">
            {addressLoading ? (
              <LoadingSpinner text="Loading address…" />
            ) : addressError ? null : address ? (
              <ReceiveQrCode value={address} rail="arkade" />
            ) : null}
          </div>
        </DesignCardContent>
      </DesignCard>

      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.receiveAddress}
              infoComponent={ArkadeAddressInfomodeContent}
              as="span"
            >
              Arkade receiving address
            </InfomodeWrapper>
          </DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent className="space-y-3">
          {addressError ? (
            <p className="design-type-regular text-destructive">
              Could not load Arkade address. Unlock the wallet and check your network.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div
                  data-testid="arkade-receive-address"
                  className="design-type-addresses flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2"
                >
                  {addressLoading ? 'Loading…' : address || 'Loading…'}
                </div>
                <DesignButton
                  onClick={() => {
                    void onCopy()
                  }}
                  disabled={!address}
                  aria-label="Copy address"
                  icon={<Copy />}
                />
              </div>
              {restoreWarning != null ? (
                <InfomodeWrapper
                  infoId={ARKADE_INFOMODE_IDS.receiveUnusedGap}
                  infoComponent={ArkadeReceiveUnusedGapInfomodeContent}
                  className="rounded-md"
                >
                  <p data-testid="arkade-receive-restore-warning">{restoreWarning}</p>
                </InfomodeWrapper>
              ) : null}
              {gapSurface.kind === 'visible' ? (
                <div className="space-y-2" data-testid="arkade-receive-gap-summary">
                  <InfomodeWrapper
                    infoId={ARKADE_INFOMODE_IDS.receivePaymentCount}
                    infoComponent={ArkadeReceivePaymentCountInfomodeContent}
                    className="rounded-md"
                  >
                    <p data-testid="arkade-receive-payment-count">
                      {arkadePaymentCountLabel(gapSurface.receiveCount)}
                    </p>
                  </InfomodeWrapper>
                  {gapSurface.gapLabel != null ? (
                    <InfomodeWrapper
                      infoId={ARKADE_INFOMODE_IDS.receiveUnusedGap}
                      infoComponent={ArkadeReceiveUnusedGapInfomodeContent}
                      className="rounded-md"
                    >
                      <p data-testid="arkade-receive-unused-gap">{gapSurface.gapLabel}</p>
                    </InfomodeWrapper>
                  ) : null}
                </div>
              ) : null}
              <DesignButton
                type="button"
                className="w-full"
                data-testid="arkade-generate-new-address"
                disabled={revealPending || !address}
                onClick={() => {
                  void onGenerate()
                }}
                icon={
                  revealPending ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw />
                  )
                }
              >
                Generate New Address
              </DesignButton>
            </>
          )}
        </DesignCardContent>
      </DesignCard>
    </>
  )
}
