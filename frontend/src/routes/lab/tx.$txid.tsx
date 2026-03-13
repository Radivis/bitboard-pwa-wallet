import { useState, useEffect, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getLabWorker } from '@/workers/lab-factory'
import { truncateAddress, formatSats } from '@/lib/bitcoin-utils'
import type { LabTxDetails } from '@/workers/lab-api'
import { Copy, ArrowLeft, Wallet, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import { getOwnerDisplayName, getOwnerIcon } from '@/lib/lab-utils'
import { useWallets } from '@/db'

export const Route = createFileRoute('/lab/tx/$txid')({
  component: LabTxViewerPage,
})

function LabTxViewerPage() {
  const { txid } = Route.useParams()
  const [tx, setTx] = useState<LabTxDetails | null | undefined>(undefined)
  const { data: wallets = [] } = useWallets()

  const loadTx = useCallback(async () => {
    try {
      const worker = getLabWorker()
      const details = await worker.getTransaction(txid)
      setTx(details ?? null)
    } catch {
      setTx(null)
    }
  }, [txid])

  useEffect(() => {
    loadTx()
  }, [loadTx])

  const handleCopyTxid = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(txid)
      toast.success('Txid copied to clipboard')
    } catch {
      toast.error('Failed to copy txid')
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
        <Link to="/lab">
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
  const feeSats = totalInputs - totalOutputs
  const timestamp =
    tx.blockTime > 0 ? new Date(tx.blockTime * 1000).toLocaleString() : null
  const confirmationsText =
    tx.confirmations === 0
      ? 'Unconfirmed (0 confirmations)'
      : `${tx.confirmations} confirmations`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/lab">
          <Button variant="ghost" size="icon" aria-label="Back to lab">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">Transaction</h2>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-mono text-base break-all">{txid}</CardTitle>
            <Button size="icon" variant="ghost" onClick={handleCopyTxid} aria-label="Copy txid">
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

      <Card>
        <CardHeader>
          <CardTitle>TxIns</CardTitle>
          <CardDescription>Inputs to this transaction</CardDescription>
        </CardHeader>
        <CardContent>
          {tx.inputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inputs (coinbase)</p>
          ) : (
            <div className="space-y-2">
              {tx.inputs.map((inp, idx) => (
                <div
                  key={`${inp.address}-${idx}`}
                  className="flex gap-4 items-center py-2 border-b border-border last:border-0"
                >
                  <span className="font-mono text-sm break-all flex-1 min-w-0">
                    {truncateAddress(inp.address)}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {inp.owner ? (
                      getOwnerIcon(inp.owner) === 'wallet' ? (
                        <Wallet className="h-4 w-4" />
                      ) : (
                        <FlaskConical className="h-4 w-4" />
                      )
                    ) : null}
                    <Badge variant="secondary">
                      {inp.owner ? getOwnerDisplayName(inp.owner, wallets) : 'unknown'}
                    </Badge>
                  </span>
                  <span className="tabular-nums text-right">{formatSats(inp.amountSats)} sats</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TxOuts</CardTitle>
          <CardDescription>Outputs from this transaction</CardDescription>
        </CardHeader>
        <CardContent>
          {tx.outputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outputs</p>
          ) : (
            <div className="space-y-2">
              {tx.outputs.map((out, idx) => (
                <div
                  key={`${out.address}-${idx}`}
                  className="flex gap-4 items-center py-2 border-b border-border last:border-0"
                >
                  <span className="font-mono text-sm break-all flex-1 min-w-0">
                    {truncateAddress(out.address)}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {out.owner ? (
                      getOwnerIcon(out.owner) === 'wallet' ? (
                        <Wallet className="h-4 w-4" />
                      ) : (
                        <FlaskConical className="h-4 w-4" />
                      )
                    ) : null}
                    <Badge variant="secondary">
                      {out.owner ? getOwnerDisplayName(out.owner, wallets) : 'unknown'}
                    </Badge>
                  </span>
                  <span className="tabular-nums text-right">{formatSats(out.amountSats)} sats</span>
                  {out.isChange && (
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
    </div>
  )
}
