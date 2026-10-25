import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DesignInput } from '@/components/design/DesignInput'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { LAB_MAX_RANDOM_ENTITY_TRANSACTIONS } from '@/lib/lab/lab-random-limits'

const MIN_AMOUNT_SATS = 1
const MIN_RANDOM_TRANSACTION_COUNT = 1

function parseAndClampRandomTransactionCount(raw: string): string {
  if (raw === '') return ''
  const parsedValue = Number.parseInt(raw.trim(), 10)
  if (Number.isNaN(parsedValue)) return raw
  const clamped = Math.min(
    Math.max(parsedValue, MIN_RANDOM_TRANSACTION_COUNT),
    LAB_MAX_RANDOM_ENTITY_TRANSACTIONS,
  )
  return String(clamped)
}

function parseRandomTransactionCountValue(raw: string): number | null {
  if (raw === '') return null
  const parsedValue = Number.parseInt(raw.trim(), 10)
  return Number.isNaN(parsedValue) ? null : parsedValue
}

export function LabMakeTransactionCard({
  showTxForm,
  setShowTxForm,
  fromAddress,
  setFromAddress,
  toAddress,
  setToAddress,
  amountSats,
  setAmountSats,
  feeRate,
  setFeeRate,
  onSend,
  sending,
  controlledAddressesCount,
  randomTransactionCount,
  setRandomTransactionCount,
  onCreateRandomTransactions,
  creatingRandomTransactions,
  randomBatchProgress,
  labEntitiesCount,
  hasMinedBlocks,
  sendDisabledFromDeadEntity = false,
  deadFromEntityDisplayName = '',
}: {
  showTxForm: boolean
  setShowTxForm: (value: boolean) => void
  fromAddress: string
  setFromAddress: (value: string) => void
  toAddress: string
  setToAddress: (value: string) => void
  amountSats: string
  setAmountSats: (value: string) => void
  feeRate: string
  setFeeRate: (value: string) => void
  onSend: () => void
  sending: boolean
  controlledAddressesCount: number
  randomTransactionCount: string
  setRandomTransactionCount: (value: string) => void
  onCreateRandomTransactions: () => void
  creatingRandomTransactions: boolean
  randomBatchProgress: { created: number; total: number } | null
  labEntitiesCount: number
  /** False when the lab chain has no blocks yet (no coinbase UTXOs). */
  hasMinedBlocks: boolean
  sendDisabledFromDeadEntity?: boolean
  deadFromEntityDisplayName?: string
}) {
  const selectedRandomCount = parseRandomTransactionCountValue(randomTransactionCount)
  const showRandomBatchConflictWarning =
    hasMinedBlocks &&
    labEntitiesCount > 0 &&
    selectedRandomCount != null &&
    selectedRandomCount > labEntitiesCount
  const txActionsDisabled = !hasMinedBlocks

  return (
    <InfomodeWrapper
      infoId="lab-make-transaction-card"
      infoTitle="Lab transaction"
      infoText="Compose a payment inside the simulator: pick a funded lab address to spend from, a destination, an amount in satoshis, and a fee rate. The tx is built and broadcast into the lab mempool; mine blocks afterward to confirm it—same lifecycle as real Bitcoin, without real money."
      className="rounded-xl"
    >
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>Transaction</DesignCardTitle>
          <DesignCardDescription>Send coins to another address</DesignCardDescription>
        </DesignCardHeader>
        <DesignCardContent className="gap-4">
          {txActionsDisabled ? (
            <p
              className="design-type-regular text-amber-600 dark:text-amber-400"
              role="status"
            >
              No coins exist yet. Please mine some blocks on the{' '}
              <a
                href="/lab/blocks"
                className="design-type-emphasis underline underline-offset-2 text-amber-700 dark:text-amber-300"
              >
                Blocks page
              </a>{' '}
              first.
            </p>
          ) : null}
          {!showTxForm ? (
            <div className="space-y-4">
              <DesignButton
                appearance="secondary"
                onClick={() => setShowTxForm(true)}
                disabled={txActionsDisabled || controlledAddressesCount === 0}
              >
                Make transaction
              </DesignButton>
              <div className="space-y-2 border rounded-lg p-4">
                <Label htmlFor="random-transaction-count">Number of random transactions</Label>
                <DesignInput
                  id="random-transaction-count"
                  type="number"
                  min={MIN_RANDOM_TRANSACTION_COUNT}
                  max={LAB_MAX_RANDOM_ENTITY_TRANSACTIONS}
                  value={randomTransactionCount}
                  onChange={(e) =>
                    setRandomTransactionCount(parseAndClampRandomTransactionCount(e.target.value))
                  }
                  disabled={creatingRandomTransactions || txActionsDisabled}
                />
                {hasMinedBlocks && labEntitiesCount === 0 ? (
                  <p className="design-type-regular text-muted-foreground">
                    Mining a block to a name enables random transactions.
                  </p>
                ) : null}
                {creatingRandomTransactions && randomBatchProgress != null ? (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <LoadingSpinner text="Rolling random transaction data and signing lab transactions" />
                    <p className="design-type-regular text-center text-muted-foreground">
                      Created {randomBatchProgress.created} of {randomBatchProgress.total}{' '}
                      random transactions
                    </p>
                  </div>
                ) : null}
                <DesignButton
                  appearance="tertiary"
                  onClick={onCreateRandomTransactions}
                  disabled={
                    txActionsDisabled || creatingRandomTransactions || labEntitiesCount === 0
                  }
                >
                  Make random transaction
                </DesignButton>
                {showRandomBatchConflictWarning ? (
                  <p
                    className="design-type-regular text-amber-600 dark:text-amber-400"
                    role="status"
                  >
                    You chose more random transactions than there are lab entities. That makes
                    conflicting spends very likely, so not every transaction may end up in a block.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4 border rounded-lg p-4">
              <div className="space-y-2">
                <Label htmlFor="from-address">From address</Label>
                <DesignInput
                  id="from-address"
                  type="text"
                  placeholder="bcrt1q... or bcrt1p..."
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                />
                {sendDisabledFromDeadEntity && deadFromEntityDisplayName ? (
                  <p className="design-type-regular text-muted-foreground" role="status">
                    This address belongs to DEAD lab entity {deadFromEntityDisplayName} — sending is
                    disabled.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-address">To address</Label>
                <DesignInput
                  id="to-address"
                  type="text"
                  placeholder="bcrt1q... or bcrt1p..."
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (sats)</Label>
                <DesignInput
                  id="amount"
                  type="number"
                  min={MIN_AMOUNT_SATS}
                  placeholder="1000"
                  value={amountSats}
                  onChange={(e) => setAmountSats(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fee-rate">
                  <InfomodeWrapper
                    as="span"
                    infoId="lab-fee-rate-sat-vb"
                    infoTitle="Fee rate (sat/vB)"
                    infoText="On Bitcoin, fees pay for block space, not for how many coins you move. Transactions are measured in virtual bytes (vB). Your fee rate is satoshis per vB: how much you offer miners for each unit of space your transaction occupies. More inputs and outputs usually mean a larger transaction and therefore a higher total fee at the same rate. A higher rate generally means faster confirmation when blocks are full; a lower rate saves money but may wait longer. In the lab, tweaking this is a safe way to see how wallets think about priority versus cost—total fee is roughly fee rate × size in vB."
                  >
                    Fee rate (sat/vB)
                  </InfomodeWrapper>
                </Label>
                <DesignInput
                  id="fee-rate"
                  type="number"
                  min={0.1}
                  step={0.1}
                  placeholder="1"
                  value={feeRate}
                  onChange={(e) => setFeeRate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <DesignButton
                  onClick={onSend}
                  disabled={txActionsDisabled || sending || sendDisabledFromDeadEntity}
                >
                  {sending ? 'Sending...' : 'Send'}
                </DesignButton>
                <DesignButton
                  appearance="secondary"
                  onClick={() => {
                    setShowTxForm(false)
                    setFromAddress('')
                    setToAddress('')
                    setAmountSats('')
                  }}
                  disabled={sending}
                >
                  Cancel
                </DesignButton>
              </div>
            </div>
          )}
        </DesignCardContent>
    </DesignCard>
    </InfomodeWrapper>
  )
}
