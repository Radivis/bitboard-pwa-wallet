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
import {
  LAB_MAX_BLOCKS_PER_MINE,
  LAB_MIN_BLOCKS_PER_MINE,
} from '@/workers/lab-api'

function TargetAddressField({
  ownerType,
  walletStatus,
  currentAddress,
  targetAddress,
  onTargetAddressChange,
}: {
  ownerType: 'name' | 'wallet'
  walletStatus: string
  currentAddress: string | null
  targetAddress: string
  onTargetAddressChange: (value: string) => void
}) {
  if (ownerType === 'wallet') {
    if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
      return (
        <Input
          id="target-address"
          type="text"
          value={currentAddress ?? ''}
          readOnly
          className="min-w-[200px] font-mono text-sm"
        />
      )
    }
    return (
      <p className="text-sm text-muted-foreground py-2">
        Unlock wallet to mine to it
      </p>
    )
  }
  return (
    <Input
      id="target-address"
      type="text"
      placeholder="bcrt1q... or bcrt1p..."
      value={targetAddress}
      onChange={(e) => onTargetAddressChange(e.target.value)}
      className="min-w-[200px]"
    />
  )
}

export function LabBlocksCard({
  blockCount,
  mineCount,
  setMineCount,
  ownerType,
  setOwnerType,
  targetAddress,
  setTargetAddress,
  ownerName,
  setOwnerName,
  mining,
  onMine,
  walletStatus,
  currentAddress,
  activeWallet,
}: {
  blockCount: number
  mineCount: string
  setMineCount: (v: string) => void
  ownerType: 'name' | 'wallet'
  setOwnerType: (v: 'name' | 'wallet') => void
  targetAddress: string
  setTargetAddress: (v: string) => void
  ownerName: string
  setOwnerName: (v: string) => void
  mining: boolean
  onMine: () => void
  walletStatus: string
  currentAddress: string | null
  activeWallet: { name: string } | undefined
}) {
  return (
    <InfomodeWrapper
      infoId="lab-blocks-card"
      infoTitle="Blocks (lab)"
      infoText="Blocks are cryptograhically secured data structures that store verified transactions. The blocks in this lab are structurally identical to the blocks in the real Bitcoin mainnet, but not connected to any real Bitcoin network in the internet. The blocks here live only in the Bitboard Wallet app only!"
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Blocks</CardTitle>
          <CardDescription>Blocks mined: {blockCount}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="mine-count">Number of blocks</Label>
              <Input
                id="mine-count"
                type="number"
                min={LAB_MIN_BLOCKS_PER_MINE}
                max={LAB_MAX_BLOCKS_PER_MINE}
                value={mineCount}
                onChange={(e) => setMineCount(e.target.value)}
                className="w-24"
              />
            </div>
          <div className="space-y-2">
            <Label>
              <InfomodeWrapper
                as="span"
                infoId="lab-owner-type-label"
                infoTitle="Owner type"
                infoText="Decides who receives the freshly mined lab coins. “Name” credits a lab-only identity you control with keys shown in the lab UI. “Wallet” sends the reward to your currently unlocked Bitboard wallet’s receive address so the same seed you use in the app gets the funds inside the simulator."
              >
                Owner type
              </InfomodeWrapper>
            </Label>
            <div className="flex gap-2">
              <InfomodeWrapper
                infoId="lab-owner-type-name-button"
                infoTitle="Name"
                infoText="Named lab owners are fictional participants with their own addresses and WIF keys inside the simulator—handy for moving coins between “Alice”, “Bob”, etc., without involving your real wallet."
              >
                <Button
                  type="button"
                  variant={ownerType === 'name' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOwnerType('name')}
                >
                  Name
                </Button>
              </InfomodeWrapper>
              <InfomodeWrapper
                infoId="lab-owner-type-wallet-button"
                infoTitle="Wallet"
                infoText="Mining rewards go straight to your loaded wallet’s active receive address (you must be unlocked). Use this when you want the lab chain to fund the same wallet you use elsewhere in Bitboard for practice sends and sync."
              >
                <Button
                  type="button"
                  variant={ownerType === 'wallet' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOwnerType('wallet')}
                >
                  Wallet
                </Button>
              </InfomodeWrapper>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-address">
              {ownerType === 'wallet'
                ? 'Target address (active wallet)'
                : 'Target address (blank = random)'}
            </Label>
            <TargetAddressField
              ownerType={ownerType}
              walletStatus={walletStatus}
              currentAddress={currentAddress}
              targetAddress={targetAddress}
              onTargetAddressChange={setTargetAddress}
            />
          </div>
          {ownerType === 'name' && (
            <div className="space-y-2">
              <Label htmlFor="owner-name">Owner (optional)</Label>
              <Input
                id="owner-name"
                type="text"
                placeholder="Alice"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="min-w-[120px]"
              />
            </div>
          )}
          {ownerType === 'wallet' && activeWallet && (
            <p className="text-sm text-muted-foreground">
              Mining to: {activeWallet.name}
            </p>
          )}
          <InfomodeWrapper
            infoId="lab-mine-blocks-button"
            infoTitle="Mine blocks"
            infoText="Runs the lab miner for the number of blocks you entered. Each block can pay coinbase to your chosen target, creating spendable test coins instantly—no electricity, no real network, just a teaching sandbox."
          >
            <Button
              onClick={onMine}
              disabled={
                mining ||
                (ownerType === 'wallet' &&
                  (walletStatus !== 'unlocked' && walletStatus !== 'syncing')) ||
                (ownerType === 'wallet' && (!currentAddress || !activeWallet))
              }
            >
              {mining ? 'Mining...' : 'Mine blocks'}
            </Button>
          </InfomodeWrapper>
        </div>
      </CardContent>
    </Card>
    </InfomodeWrapper>
  )
}
