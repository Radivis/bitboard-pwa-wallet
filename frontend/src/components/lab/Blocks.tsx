import { Link } from '@tanstack/react-router'
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
import type { LabEntityRecord } from '@/workers/lab-api'
import { formatLabEntityMineOptionLabel } from '@/lib/lab-entity-keys'
import { LabOwnerType } from '@/lib/lab-owner-type'
import { cn } from '@/lib/utils'
import { useFeatureStore } from '@/stores/featureStore'

export function LabBlocksCard({
  blockCount,
  mineCount,
  setMineCount,
  ownerType,
  setOwnerType,
  entities,
  selectedLabEntityId,
  setSelectedLabEntityId,
  mining,
  onMine,
  walletStatus,
  currentAddress,
  activeWallet,
}: {
  blockCount: number
  mineCount: string
  setMineCount: (v: string) => void
  ownerType: LabOwnerType
  setOwnerType: (v: LabOwnerType) => void
  entities: readonly LabEntityRecord[]
  selectedLabEntityId: number | null
  setSelectedLabEntityId: (id: number | null) => void
  mining: boolean
  onMine: () => void
  walletStatus: string
  currentAddress: string | null
  activeWallet: { name: string } | undefined
}) {
  const segwitAddressesEnabled = useFeatureStore((s) => s.segwitAddressesEnabled)
  const livingEntities = entities.filter((e) => !e.isDead)
  const noLivingEntities =
    ownerType === LabOwnerType.LabEntity && livingEntities.length === 0

  return (
    <InfomodeWrapper
      infoId="lab-currently-mined-block-card"
      infoTitle="Currently mined block (lab)"
      infoText="This simulates a single miner extending the lab chain—no proof of work, just the same block and coinbase structure as real Bitcoin for learning. Choose how many blocks to append, who receives the subsidy, then mine. Blocks are cryptographically structured like mainnet but exist only inside this app."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Currently mined block</CardTitle>
              <CardDescription>
                Simplified single-miner setup · Chain height (blocks mined): {blockCount}
              </CardDescription>
            </div>
            <Link
              to="/lab/block/current"
              preload={false}
              className="inline-flex shrink-0 rounded-md border border-border bg-muted/40 px-2 py-1 text-sm font-medium transition-colors hover:bg-muted"
            >
              Current template
            </Link>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
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
                  infoText="Decides who receives the freshly mined lab coins. “Lab entity” credits a simulated participant with a local descriptor wallet (plaintext in the lab DB). “Wallet” sends the reward to your unlocked Bitboard wallet’s receive address (your real seed, encrypted)."
                >
                  Owner type
                </InfomodeWrapper>
              </Label>
              <div className="flex gap-2">
                <InfomodeWrapper
                  infoId="lab-owner-type-name-button"
                  infoTitle="Lab entity"
                  infoText="Lab entities are simulated participants with a BIP39-backed descriptor wallet stored in plaintext in the lab database—use them for “Alice”, “Bob”, etc., without touching your real wallet."
                >
                  <Button
                    type="button"
                    variant={
                      ownerType === LabOwnerType.LabEntity ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => setOwnerType(LabOwnerType.LabEntity)}
                  >
                    Lab entity
                  </Button>
                </InfomodeWrapper>
                <InfomodeWrapper
                  infoId="lab-owner-type-wallet-button"
                  infoTitle="Wallet"
                  infoText="Mining rewards go straight to your loaded wallet’s active receive address (you must be unlocked). Use this when you want the lab chain to fund the same wallet you use elsewhere in Bitboard for practice sends and sync."
                >
                  <Button
                    type="button"
                    variant={
                      ownerType === LabOwnerType.Wallet ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => setOwnerType(LabOwnerType.Wallet)}
                  >
                    Wallet
                  </Button>
                </InfomodeWrapper>
              </div>
            </div>
            {ownerType === LabOwnerType.Wallet ? (
              <div className="space-y-2">
                <Label htmlFor="target-address">Target address (active wallet)</Label>
                {walletStatus === 'unlocked' || walletStatus === 'syncing' ? (
                  <Input
                    id="target-address"
                    type="text"
                    value={currentAddress ?? ''}
                    readOnly
                    className="min-w-[200px] font-mono text-sm"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    Unlock wallet to mine to it
                  </p>
                )}
              </div>
            ) : noLivingEntities ? (
              <p className="text-sm text-muted-foreground">
                Create at least one living lab entity on the{' '}
                <Link to="/lab/control" className="underline font-medium text-foreground">
                  Control
                </Link>{' '}
                page before mining here.
              </p>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="lab-entity-mine-select">
                  <InfomodeWrapper
                    as="span"
                    infoId="lab-entity-mine-select-label"
                    infoTitle="Lab entity"
                    infoText="Coinbase rewards are paid to this entity’s current receive address. Dead entities are not listed."
                  >
                    Lab entity
                  </InfomodeWrapper>
                </Label>
                <select
                  id="lab-entity-mine-select"
                  className={cn(
                    'flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm',
                    'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
                  value={selectedLabEntityId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setSelectedLabEntityId(v === '' ? null : Number(v))
                  }}
                >
                  {livingEntities.map((e) => (
                    <option key={e.labEntityId} value={e.labEntityId}>
                      {formatLabEntityMineOptionLabel(e, segwitAddressesEnabled)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {ownerType === LabOwnerType.Wallet && activeWallet && (
              <p className="text-sm text-muted-foreground">Mining to: {activeWallet.name}</p>
            )}
          </div>
          <div className="border-t border-border pt-4">
            <InfomodeWrapper
              infoId="lab-mine-blocks-button"
              infoTitle="Mine blocks"
              infoText="Runs the lab miner for the number of blocks you entered. Each block can pay coinbase to your chosen target, creating spendable test coins instantly—no electricity, no real network, just a teaching sandbox."
            >
              <Button
                onClick={onMine}
                disabled={
                  mining ||
                  noLivingEntities ||
                  (ownerType === LabOwnerType.Wallet &&
                    walletStatus !== 'unlocked' &&
                    walletStatus !== 'syncing') ||
                  (ownerType === LabOwnerType.Wallet &&
                    (!currentAddress || !activeWallet))
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
