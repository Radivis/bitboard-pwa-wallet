import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Copy, ExternalLink, Layers } from 'lucide-react'
import { ArkadeBoardingInfomodeContent } from '@/components/arkade/infomode/ArkadeBoardingInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import {
  ARKADE_BOARDING_ADDRESS_INFOMODE,
  ARKADE_BOARD_STATUS_EXPIRED_INFOMODE,
  ARKADE_BOARD_STATUS_READY_INFOMODE,
  ARKADE_INFOMODE_IDS,
} from '@/lib/arkade/arkade-infomode'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useArkadeBoardingAddressQuery,
  useArkadeBoardingStatusQuery,
  useArkadeOnboardMutation,
} from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import { useWalletStore } from '@/stores/walletStore'
import { toast } from 'sonner'

function boardingExplorerUrl(networkMode: string, address: string): string {
  if (networkMode === 'signet') {
    return `https://mutinynet.com/address/${address}`
  }
  if (networkMode === 'mainnet') {
    return `https://mempool.space/address/${address}`
  }
  return `https://mempool.space/testnet4/address/${address}`
}

export function ArkadeBoardPage() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const onboardMutation = useArkadeOnboardMutation()
  const boardingQuery = useArkadeBoardingAddressQuery()
  const boardingStatusQuery = useArkadeBoardingStatusQuery()
  const [copied, setCopied] = useState(false)

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Board to Arkade" icon={Layers} />
        <p className="text-muted-foreground">Arkade is not enabled for this network.</p>
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet">Back</Link>
        </Button>
      </div>
    )
  }

  const boardingAddress = boardingQuery.data ?? ''
  const boardingStatus = boardingStatusQuery.data

  const handleCopy = async () => {
    if (!boardingAddress) return
    await navigator.clipboard.writeText(boardingAddress)
    setCopied(true)
    toast.success('Boarding address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Board to Arkade" icon={Layers} />
      <Card>
        <CardHeader>
          <CardTitle>
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.boardFlow}
              infoComponent={ArkadeBoardingInfomodeContent}
              as="span"
            >
              From on-chain to Arkade
            </InfomodeWrapper>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Copy the boarding address below.</li>
            <li>
              Send Bitcoin from your{' '}
              <Link to="/wallet/send" className="text-primary underline-offset-4 hover:underline">
                on-chain wallet
              </Link>{' '}
              to that address and wait for confirmation.
            </li>
            <li>Settle the boarding UTXO into Arkade (creates VTXOs).</li>
          </ol>

          {boardingQuery.isLoading ? (
            <p className="text-muted-foreground">Loading boarding address…</p>
          ) : (
            <>
              <InfomodeWrapper
                infoId={ARKADE_INFOMODE_IDS.boardingAddress}
                infoTitle={ARKADE_BOARDING_ADDRESS_INFOMODE.title}
                infoText={ARKADE_BOARDING_ADDRESS_INFOMODE.text}
                as="span"
              >
                <p className="break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">
                  {boardingAddress}
                </p>
              </InfomodeWrapper>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleCopy} disabled={!boardingAddress}>
                  <Copy className="h-4 w-4" aria-hidden />
                  {copied ? 'Copied' : 'Copy boarding address'}
                </Button>
                {boardingAddress ? (
                  <Button type="button" variant="outline" asChild>
                    <a
                      href={boardingExplorerUrl(networkMode, boardingAddress)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      View on explorer
                    </a>
                  </Button>
                ) : null}
              </div>
            </>
          )}

          {boardingStatusQuery.isLoading ? (
            <p className="text-muted-foreground">Checking boarding UTXOs…</p>
          ) : boardingStatus ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="font-medium">On-chain boarding status</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>
                  <InfomodeWrapper
                    infoId={ARKADE_INFOMODE_IDS.boardStatusReady}
                    infoTitle={ARKADE_BOARD_STATUS_READY_INFOMODE.title}
                    infoText={ARKADE_BOARD_STATUS_READY_INFOMODE.text}
                    as="span"
                  >
                    Ready to settle: {formatSats(boardingStatus.spendableSats)}
                  </InfomodeWrapper>
                </li>
                <li>Pending confirmation: {formatSats(boardingStatus.pendingSats)}</li>
                <li>
                  <InfomodeWrapper
                    infoId={ARKADE_INFOMODE_IDS.boardStatusExpired}
                    infoTitle={ARKADE_BOARD_STATUS_EXPIRED_INFOMODE.title}
                    infoText={ARKADE_BOARD_STATUS_EXPIRED_INFOMODE.text}
                    as="span"
                  >
                    Unilateral exit only: {formatSats(boardingStatus.expiredSats)}
                  </InfomodeWrapper>
                </li>
              </ul>
              {boardingStatus.spendableSats === 0 &&
              boardingStatus.pendingSats === 0 &&
              boardingStatus.expiredSats === 0 ? (
                <p className="mt-2 text-muted-foreground">
                  No UTXOs detected at this boarding address yet. Confirm the send used the address
                  above, not your regular on-chain receive address.
                </p>
              ) : null}
            </div>
          ) : null}

          <Button
            type="button"
            disabled={onboardMutation.isPending || !boardingAddress}
            onClick={() => onboardMutation.mutate()}
          >
            {onboardMutation.isPending ? 'Settling…' : 'Settle boarding UTXO'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
