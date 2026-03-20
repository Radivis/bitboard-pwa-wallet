import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
            <p className="text-xs text-muted-foreground max-w-[14rem]">
              Up to {LAB_MAX_BLOCKS_PER_MINE} per run (larger batches can freeze the UI)
            </p>
          </div>
          <div className="space-y-2">
            <Label>Owner type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={ownerType === 'name' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setOwnerType('name')}
              >
                Name
              </Button>
              <Button
                type="button"
                variant={ownerType === 'wallet' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setOwnerType('wallet')}
              >
                Wallet
              </Button>
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
        </div>
      </CardContent>
    </Card>
  )
}
