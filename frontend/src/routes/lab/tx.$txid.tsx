import { useState, useEffect, useCallback } from 'react'
import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getLabWorker } from '@/workers/lab-factory'
import { truncateAddress, formatSats } from '@/lib/bitcoin-utils'
import type { LabTxDetails } from '@/workers/lab-api'
import { Copy, ArrowLeft, Wallet, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import { isCoinbase } from '@/lib/lab-operations'
import { getOwnerIcon } from '@/lib/lab-utils'
import { LabOwnerDisplayWithAddressType } from '@/components/lab/LabOwnerDisplayWithAddressType'
import { useWallets } from '@/db'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/lab/tx/$txid')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { highlightVout?: number } => {
    const raw = search.highlightVout
    if (raw === undefined || raw === null || raw === '') return {}
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
    if (!Number.isFinite(n) || n < 0) return {}
    return { highlightVout: Math.floor(n) }
  },
  component: LabTxViewerPage,
})

function LabTxViewerPage() {
  const { txid } = Route.useParams()
  const { highlightVout } = useSearch({ from: '/lab/tx/$txid' })
  const [tx, setTx] = useState<LabTxDetails | null | undefined>(undefined)
  const { data: wallets = [] } = useWallets()
  const { data: labState } = useLabChainStateQuery()
  const entities = labState?.entities ?? []

  const loadTx = useCallback(async () => {
    try {
      const labWorker = getLabWorker()
      const details = await labWorker.getTransaction(txid)
      setTx(details ?? null)
    } catch {
      setTx(null)
    }
  }, [txid])

  useEffect(() => {
    loadTx()
  }, [loadTx])

  useEffect(() => {
    if (highlightVout === undefined || tx == null) return
    const id = `lab-tx-vout-${highlightVout}`
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightVout, txid, tx])

  const handleCopyTxid = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(txid)
      toast.success('Transaction id copied to clipboard')
    } catch {
      toast.error('Failed to copy transaction id')
    }
  }, [txid])

  if (tx === undefined) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">Loading transaction...</p>
      </div>
    )
  }

  if (tx === null) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">Transaction not found.</p>
        <Link to="/lab" preload={false}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to lab
          </Button>
        </Link>
      </div>
    )
  }

  const totalInputs = tx.inputs.reduce((sum, i) => sum + i.amountSats, 0)
  const totalOutputs = tx.outputs.reduce((sum, o) => sum + o.amountSats, 0)
  const feeSats = isCoinbase(tx) ? 0 : totalInputs - totalOutputs
  const timestamp =
    tx.blockTime > 0 ? new Date(tx.blockTime * 1000).toLocaleString() : null
  const confirmationsText =
    tx.confirmations === 0
      ? 'Unconfirmed (0 confirmations)'
      : `${tx.confirmations} confirmations`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/lab" preload={false}>
          <Button variant="ghost" size="icon" aria-label="Back to lab">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <PageHeader title="Transaction" icon={FlaskConical} />
          {isCoinbase(tx) ? (
            <Badge variant="outline" className="shrink-0">
              Coinbase
            </Badge>
          ) : null}
        </div>
      </div>

      <InfomodeWrapper
        infoId="lab-tx-detail-summary-card"
        infoTitle="Transaction summary"
        infoText="The transaction id is the fingerprint of this payment on the lab chain—share it to refer to exactly this transfer. Confirmations count blocks mined on top: zero means it is still waiting in the mempool like a real network. “Total out” adds up every output amount; the fee is what is left from inputs minus outputs—the incentive that would go to a miner on mainnet (here it helps you read economic cost in the simulator)."
        className="rounded-xl"
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="font-mono text-base break-all">{txid}</CardTitle>
              <Button size="icon" variant="ghost" onClick={handleCopyTxid} aria-label="Copy transaction id">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              {timestamp ? `${timestamp} · ` : ''}
              {confirmationsText}
              {' · '}
              {formatSats(totalOutputs)} sats total out · {formatSats(feeSats)} sats fee
            </CardDescription>
          </CardHeader>
        </Card>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="lab-tx-detail-inputs-card"
        infoTitle="Inputs"
        infoText="Each input spends a specific previous output from an earlier transaction. Follow the link to open that funding transaction and highlight which output is being spent. The address line shows where the coins came from; the owner badge shows whether that coin belonged to a named lab participant or your loaded wallet. Block-reward coinbase transactions use a synthetic reference (all-zero transaction id and maximum output index) instead of spending a prior coin."
        className="rounded-xl"
      >
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Inputs to this transaction</CardDescription>
          </CardHeader>
          <CardContent>
            {isCoinbase(tx) ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  One coinbase input (no previous output spent).
                </p>
                {tx.inputs.map((input, index) => (
                  <div
                    key={`coinbase-${index}`}
                    className="rounded-md border border-border p-3 font-mono text-xs space-y-1"
                  >
                    <p>
                      <span className="text-muted-foreground">Previous transaction:</span>{' '}
                      {input.prevTxid ?? '(null)'}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Output index:</span>{' '}
                      {input.prevVout != null ? `0x${input.prevVout.toString(16)}` : '—'}
                    </p>
                    <p>
                      <span className="text-muted-foreground">sequence:</span>{' '}
                      {input.sequence != null ? `0x${input.sequence.toString(16)}` : '—'}
                    </p>
                  </div>
                ))}
              </div>
            ) : tx.inputs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inputs</p>
            ) : (
              <div className="space-y-2">
                {tx.inputs.map((input, inputIndex) => {
                  const hasPrevout =
                    input.prevTxid != null &&
                    input.prevTxid !== '' &&
                    input.prevVout != null &&
                    input.prevVout !== undefined
                  return (
                    <div
                      key={`${input.address}-${inputIndex}`}
                      className="flex flex-col gap-1 py-2 border-b border-border last:border-0 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                        {hasPrevout ? (
                          <Link
                            to="/lab/tx/$txid"
                            params={{ txid: input.prevTxid! }}
                            search={{ highlightVout: input.prevVout! }}
                            className="font-mono text-sm text-primary hover:underline break-all"
                            preload={false}
                          >
                            {truncateAddress(input.prevTxid!, 10, 10)} : {input.prevVout}
                          </Link>
                        ) : null}
                        <span className="font-mono text-sm break-all text-muted-foreground">
                          {truncateAddress(input.address)}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 shrink-0">
                        {input.owner ? (
                          getOwnerIcon(input.owner) === 'wallet' ? (
                            <Wallet className="h-4 w-4" />
                          ) : (
                            <FlaskConical className="h-4 w-4" />
                          )
                        ) : null}
                        {input.owner ? (
                          <LabOwnerDisplayWithAddressType
                            owner={input.owner}
                            wallets={wallets}
                            entities={entities}
                          />
                        ) : (
                          <Badge variant="secondary">unknown</Badge>
                        )}
                      </span>
                      <span className="tabular-nums text-right sm:shrink-0">
                        {formatSats(input.amountSats)} sats
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="lab-tx-detail-outputs-card"
        infoTitle="Outputs"
        infoText="Outputs are the destinations of the payment: amounts locked to specific addresses. A row marked “Change” is not a second recipient—it is your wallet sending leftover value back to yourself after spending a larger coin than the payment amount, exactly like real Bitcoin wallets do to avoid losing the remainder."
        className="rounded-xl"
      >
        <Card>
          <CardHeader>
            <CardTitle>Outputs</CardTitle>
            <CardDescription>Outputs from this transaction</CardDescription>
          </CardHeader>
          <CardContent>
            {tx.outputs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outputs</p>
            ) : (
              <div className="space-y-2">
                {tx.outputs.map((output, index) => (
                  <div
                    id={`lab-tx-vout-${index}`}
                    data-testid={`lab-tx-vout-${index}`}
                    key={`${output.address}-${index}`}
                    className={cn(
                      'flex gap-4 items-center py-2 border-b border-border last:border-0 rounded-md -mx-1 px-1 transition-colors',
                      highlightVout === index &&
                        'ring-2 ring-primary/60 ring-offset-2 ring-offset-background bg-muted/40',
                    )}
                  >
                    <span className="font-mono text-sm break-all flex-1 min-w-0">
                      {truncateAddress(output.address)}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {output.owner ? (
                        getOwnerIcon(output.owner) === 'wallet' ? (
                          <Wallet className="h-4 w-4" />
                        ) : (
                          <FlaskConical className="h-4 w-4" />
                        )
                      ) : null}
                      {output.owner ? (
                        <LabOwnerDisplayWithAddressType
                          owner={output.owner}
                          wallets={wallets}
                          entities={entities}
                        />
                      ) : (
                        <Badge variant="secondary">unknown</Badge>
                      )}
                    </span>
                    <span className="tabular-nums text-right">{formatSats(output.amountSats)} sats</span>
                    {output.isChange && (
                      <Badge variant="secondary" className="shrink-0">
                        Change
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </InfomodeWrapper>
    </div>
  )
}
