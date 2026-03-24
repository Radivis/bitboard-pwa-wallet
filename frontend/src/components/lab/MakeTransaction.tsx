import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MIN_AMOUNT_SATS = 1

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
}: {
  showTxForm: boolean
  setShowTxForm: (v: boolean) => void
  fromAddress: string
  setFromAddress: (v: string) => void
  toAddress: string
  setToAddress: (v: string) => void
  amountSats: string
  setAmountSats: (v: string) => void
  feeRate: string
  setFeeRate: (v: string) => void
  onSend: () => void
  sending: boolean
  controlledAddressesCount: number
}) {
  return (
    <InfomodeWrapper
      infoId="lab-make-transaction-card"
      infoTitle="Lab transaction"
      infoText="Compose a payment inside the simulator: pick a funded lab address to spend from, a destination, an amount in satoshis, and a fee rate. The tx is built and broadcast into the lab mempool; mine blocks afterward to confirm it—same lifecycle as real Bitcoin, without real money."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Transaction</CardTitle>
          <CardDescription>Send coins to another address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showTxForm ? (
            <Button
              variant="outline"
              onClick={() => setShowTxForm(true)}
              disabled={controlledAddressesCount === 0}
            >
              Make transaction
            </Button>
          ) : (
            <div className="space-y-4 border rounded-lg p-4">
              <div className="space-y-2">
                <Label htmlFor="from-address">From address</Label>
                <Input
                  id="from-address"
                  type="text"
                  placeholder="bcrt1q... or bcrt1p..."
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-address">To address</Label>
                <Input
                  id="to-address"
                  type="text"
                  placeholder="bcrt1q... or bcrt1p..."
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (sats)</Label>
                <Input
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
                <Input
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
                <Button onClick={onSend} disabled={sending}>
                  {sending ? 'Sending...' : 'Send'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowTxForm(false)
                    setFromAddress('')
                    setToAddress('')
                    setAmountSats('')
                  }}
                  disabled={sending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
    </Card>
    </InfomodeWrapper>
  )
}
