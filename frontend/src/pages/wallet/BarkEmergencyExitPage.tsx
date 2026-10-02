import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { BarkExitTreeGraph } from '@/components/bark/BarkExitTreeGraph'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { barkEmergencyExitQueryKey, useBarkEmergencyExitQuery } from '@/hooks/useBarkEmergencyExitQuery'
import { barkExitTopologyQueryKey, useBarkExitTopologyQuery } from '@/hooks/useBarkExitTopologyQuery'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useEsploraFeePresets } from '@/hooks/useEsploraFeePresets'
import { barkVtxoListQueryKey, useBarkVtxoListQuery } from '@/hooks/useBarkVtxoListQuery'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import {
  barkEmergencyExitStateLabel,
  barkExitTopologyVtxoIds,
  emergencyExitStartBlocked,
} from '@/lib/bark/bark-emergency-exit'
import {
  barkEmergencyExitClaimDeps,
  barkEmergencyExitProgressDeps,
  barkEmergencyExitReviewDeps,
  barkEmergencyExitStartDeps,
} from '@/lib/bark/bark-emergency-exit-live-deps'
import {
  claimBarkEmergencyExits,
  progressBarkEmergencyExits,
  startBarkEmergencyExit,
} from '@/lib/bark/perform-bark-emergency-exit'
import {
  formatSatPerVbTwoDecimals,
  NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB,
} from '@/lib/esplora/esplora-fee-estimates'
import { errorMessage } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { BarkEmergencyExitEstimate, BarkVtxoRow } from '@/workers/bark-api'
import { getBarkWorker } from '@/workers/bark-factory'

const CANCEL_NOTE =
  'Cancel is only possible before the final exit transaction is broadcast. Ancestor transactions may already be on-chain.'

const CLAIM_NOTE = 'The on-chain balance updates after the claim confirms.'

type EmergencyExitReview = {
  vtxoIds: string[]
  estimate: BarkEmergencyExitEstimate
}

export function BarkEmergencyExitPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const confirmedSats = useWalletStore((walletState) => walletState.balance?.confirmedSats ?? 0)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const feePresetsQuery = useEsploraFeePresets(networkMode)
  const feeRateSatPerVb =
    feePresetsQuery.data?.High ?? NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB.High
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const vtxoListQuery = useBarkVtxoListQuery()
  const exitQuery = useBarkEmergencyExitQuery()
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [wholeWallet, setWholeWallet] = useState(false)
  const [review, setReview] = useState<EmergencyExitReview | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const topologyVtxoIds = useMemo(
    () =>
      barkExitTopologyVtxoIds({
        wholeWallet,
        selectedIds,
        spendableIds: (vtxoListQuery.data ?? [])
          .filter((row) => row.state === 'spendable')
          .map((row) => row.id),
        liveExitIds: (exitQuery.data ?? []).map((row) => row.vtxoId),
      }),
    [wholeWallet, selectedIds, vtxoListQuery.data, exitQuery.data],
  )
  const topologyQuery = useBarkExitTopologyQuery(topologyVtxoIds)

  if (!isBarkEnabled || !isBarkNetworkMode(networkMode)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Bark emergency exit" />
        <p className="text-muted-foreground" data-testid="bark-emergency-exit-unavailable">
          Bark emergency exit is available on Signet and Mainnet when Bark is enabled.
        </p>
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet/management">Back to management</Link>
        </Button>
      </div>
    )
  }

  const sessionReady = loadSnapshot.loadPhase === 'loaded'
  const spendableVtxos = (vtxoListQuery.data ?? []).filter((row) => row.state === 'spendable')
  const destinationAddress = currentAddress?.trim() ?? ''
  const startBlocked =
    review != null && emergencyExitStartBlocked(confirmedSats, review.estimate.exitBroadcastFeeSats)
  const exitTreeError = topologyQuery.isError
    ? errorMessage(topologyQuery.error) || 'Failed to load exit tree.'
    : null

  function clearReview() {
    setReview(null)
  }

  function toggleVtxo(vtxoId: string) {
    setWholeWallet(false)
    setSelectedIds((current) =>
      current.includes(vtxoId) ? current.filter((id) => id !== vtxoId) : [...current, vtxoId],
    )
    clearReview()
  }

  async function reloadLists() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: barkEmergencyExitQueryKey(activeWalletId, networkMode),
      }),
      queryClient.invalidateQueries({
        queryKey: barkVtxoListQueryKey(
          activeWalletId,
          networkMode,
          syncSnapshot.lastSuccessfulSyncAt,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: barkExitTopologyQueryKey(
          activeWalletId,
          networkMode,
          topologyVtxoIds,
          syncSnapshot.lastSuccessfulSyncAt,
        ),
      }),
    ])
  }

  async function onReview() {
    const vtxoIds = wholeWallet ? [] : selectedIds
    if (!wholeWallet && vtxoIds.length === 0) {
      toast.error('Select spendable VTXOs or the whole wallet.')
      return
    }
    setBusyAction('review')
    try {
      const estimate = await barkEmergencyExitReviewDeps().estimate(vtxoIds, feeRateSatPerVb)
      setReview({ vtxoIds, estimate })
    } catch (err) {
      setReview(null)
      toast.error(errorMessage(err) || 'Could not estimate the emergency exit')
    } finally {
      setBusyAction(null)
    }
  }

  async function onStart() {
    if (review == null || startBlocked) return
    setBusyAction('start')
    try {
      await startBarkEmergencyExit(barkEmergencyExitStartDeps(), review.vtxoIds)
      toast.success('Emergency exit started.')
      setSelectedIds([])
      setWholeWallet(false)
      setReview(null)
      await reloadLists()
    } catch (err) {
      toast.error(errorMessage(err) || 'Emergency exit failed to start')
    } finally {
      setBusyAction(null)
    }
  }

  async function onProgress() {
    setBusyAction('progress')
    try {
      await progressBarkEmergencyExits(barkEmergencyExitProgressDeps(), feeRateSatPerVb)
      toast.success('Emergency exit progressed.')
      await reloadLists()
    } catch (err) {
      toast.error(errorMessage(err) || 'Emergency exit failed to progress')
    } finally {
      setBusyAction(null)
    }
  }

  async function onCancel(vtxoId: string) {
    setBusyAction(`cancel:${vtxoId}`)
    try {
      await getBarkWorker().cancelEmergencyExit(vtxoId)
      toast.success('Emergency exit canceled.')
      await reloadLists()
    } catch (err) {
      toast.error(errorMessage(err) || 'Could not cancel the emergency exit')
    } finally {
      setBusyAction(null)
    }
  }

  async function onClaim() {
    if (destinationAddress.length === 0) {
      toast.error('No on-chain receive address is available.')
      return
    }
    setBusyAction('claim')
    try {
      const claimed = await claimBarkEmergencyExits(
        barkEmergencyExitClaimDeps(),
        destinationAddress,
        feeRateSatPerVb,
      )
      const claimedMessage = `Claim broadcast ${claimed.txid}. ${CLAIM_NOTE}`
      toast.success(
        claimed.syncWarning == null
          ? claimedMessage
          : `${claimedMessage} ${claimed.syncWarning}`,
      )
      await reloadLists()
    } catch (err) {
      toast.error(errorMessage(err) || 'Claim failed')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bark emergency exit" />
      <p className="text-sm text-muted-foreground">{CANCEL_NOTE}</p>
      <p className="text-sm text-muted-foreground">
        Progress is a button. It runs only when you press it.
      </p>

      {sessionReady ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Exit tree</CardTitle>
            </CardHeader>
            <CardContent>
              <BarkExitTreeGraph
                nodes={topologyVtxoIds.length === 0 ? [] : topologyQuery.data?.nodes}
                emptySelection={topologyVtxoIds.length === 0}
                errorMessage={exitTreeError}
                vtxoRows={vtxoListQuery.data ?? []}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Start an exit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="bark-emergency-exit-whole-wallet"
                  checked={wholeWallet}
                  onChange={(event) => {
                    setWholeWallet(event.target.checked)
                    if (event.target.checked) setSelectedIds([])
                    clearReview()
                  }}
                />
                Exit the whole wallet
              </label>
              <ul className="space-y-2">
                {spendableVtxos.map((row) => (
                  <SpendableVtxoRow
                    key={row.id}
                    row={row}
                    checked={!wholeWallet && selectedIds.includes(row.id)}
                    disabled={wholeWallet}
                    onToggle={() => toggleVtxo(row.id)}
                  />
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                data-testid="bark-emergency-exit-review"
                disabled={busyAction != null}
                onClick={() => void onReview()}
              >
                Review
              </Button>
              {review != null ? (
                <div className="space-y-1 text-sm" data-testid="bark-emergency-exit-fee-review">
                  <p data-testid="bark-emergency-exit-fee-rate">
                    Fee rate {formatSatPerVbTwoDecimals(review.estimate.feeRateSatPerVb)} sat/vB
                  </p>
                  <p data-testid="bark-emergency-exit-broadcast-fee">
                    Broadcast fee {formatSats(review.estimate.exitBroadcastFeeSats)}
                  </p>
                  <p data-testid="bark-emergency-exit-claim-fee">
                    Claim fee {formatSats(review.estimate.claimFeeSats)}
                  </p>
                  <p data-testid="bark-emergency-exit-tx-count">
                    Transactions to broadcast {review.estimate.txsToBroadcast}
                  </p>
                  {startBlocked ? (
                    <p data-testid="bark-emergency-exit-start-blocked">
                      Confirmed on-chain balance is below the broadcast fee.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Button
                type="button"
                data-testid="bark-emergency-exit-start"
                disabled={review == null || startBlocked || busyAction != null}
                onClick={() => void onStart()}
              >
                Start emergency exit
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live exits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                type="button"
                data-testid="bark-emergency-exit-progress"
                disabled={busyAction != null}
                onClick={() => void onProgress()}
              >
                Progress
              </Button>
              <ul className="space-y-2">
                {(exitQuery.data ?? []).map((row) => (
                  <li
                    key={row.vtxoId}
                    className="flex items-center justify-between gap-3 text-sm"
                    data-testid={`bark-emergency-exit-row-${row.vtxoId}`}
                  >
                    <span>
                      <span className="font-mono">{row.vtxoId}</span>
                      {' · '}
                      {amountLabel(vtxoListQuery.data ?? [], row.vtxoId)}
                      {' · '}
                      {barkEmergencyExitStateLabel(row.state)}
                    </span>
                    {row.cancelable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid={`bark-emergency-exit-cancel-${row.vtxoId}`}
                        disabled={busyAction != null}
                        onClick={() => void onCancel(row.vtxoId)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Claim</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm" data-testid="bark-emergency-exit-destination">
                {destinationAddress || 'No receive address'}
              </p>
              <p className="text-sm text-muted-foreground">{CLAIM_NOTE}</p>
              <Button
                type="button"
                data-testid="bark-emergency-exit-claim"
                disabled={destinationAddress.length === 0 || busyAction != null}
                onClick={() => void onClaim()}
              >
                Claim to this address
              </Button>
            </CardContent>
          </Card>
        </>
      ) : loadSnapshot.loadPhase === 'load-error' ? null : (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="bark-emergency-exit-session-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Establishing Bark session…
        </div>
      )}

      <Button type="button" variant="outline" asChild>
        <Link to="/wallet/management">Back to management</Link>
      </Button>
    </div>
  )
}

function SpendableVtxoRow({
  row,
  checked,
  disabled,
  onToggle,
}: {
  row: BarkVtxoRow
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid={`bark-emergency-exit-vtxo-${row.id}`}
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="font-mono">{row.id}</span>
        <span>{formatSats(row.amountSats)}</span>
      </label>
    </li>
  )
}

function amountLabel(allRows: BarkVtxoRow[], vtxoId: string): string {
  const match = allRows.find((row) => row.id === vtxoId)
  return match == null ? 'amount unknown' : formatSats(match.amountSats)
}
