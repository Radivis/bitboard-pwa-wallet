import { Link } from '@tanstack/react-router'
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
import {
  LAB_MAX_BLOCKS_PER_MINE,
  LAB_MIN_BLOCKS_PER_MINE,
} from '@/workers/lab-api'
import type { LabEntityRecord } from '@/workers/lab-api'
import { formatLabEntityMineOptionLabel } from '@/lib/lab/lab-entity-keys'
import { LabOwnerType } from '@/lib/lab/lab-owner-type'
import { cn } from '@/lib/shared/utils'
import { useFeatureStore } from '@/stores/featureStore'
import { useRequireUnlockedWallet } from '@/hooks/useRequireUnlockedWallet'
import type { WalletStatus } from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

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
  setMineCount: (mineCount: string) => void
  ownerType: LabOwnerType
  setOwnerType: (ownerType: LabOwnerType) => void
  entities: readonly LabEntityRecord[]
  selectedLabEntityId: number | null
  setSelectedLabEntityId: (id: number | null) => void
  mining: boolean
  onMine: () => void
  walletStatus: WalletStatus
  currentAddress: string | null
  activeWallet: { name: string } | undefined
}) {
  const isSegwitAddressesEnabled = useFeatureStore((featureState) => featureState.isSegwitAddressesEnabled)
  const { runWhenUnlocked, unlockDialog } = useRequireUnlockedWallet()
  const livingEntities = entities.filter((entity) => !entity.isDead)
  const noLivingEntities =
    ownerType === LabOwnerType.LabEntity && livingEntities.length === 0
  const walletUnlocked = walletIsUnlockedOrSyncing(walletStatus)

  const handleMineClick = () => {
    if (ownerType === LabOwnerType.Wallet) {
      runWhenUnlocked(onMine)
      return
    }
    onMine()
  }

  return (
    <InfomodeWrapper
      infoId="lab-currently-mined-block-card"
      infoTitle="Currently mined block (lab)"
      infoText="This simulates a single miner extending the lab chain—no proof of work, just the same block and coinbase structure as real Bitcoin for learning. Choose how many blocks to append, who receives the subsidy, then mine. Blocks are cryptographically structured like mainnet but exist only inside this app."
      className="rounded-xl"
    >
      <DesignCard>
        <DesignCardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1.5">
              <DesignCardTitle>Currently mined block</DesignCardTitle>
              <DesignCardDescription>
                Simplified single-miner setup · Chain height (blocks mined): {blockCount}
              </DesignCardDescription>
            </div>
            <Link
              to="/lab/block/current"
              preload={false}
              className="design-type-emphasis inline-flex shrink-0 rounded-md border border-border bg-muted/40 px-2 py-1 transition-colors hover:bg-muted"
            >
              Current template
            </Link>
          </div>
        </DesignCardHeader>
        <DesignCardContent className="gap-6">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="mine-count">Number of blocks</Label>
              <DesignInput
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
                  <DesignButton
                    type="button"
                    appearance={
                      ownerType === LabOwnerType.LabEntity ? 'primary' : 'secondary'
                    }
                    onClick={() => setOwnerType(LabOwnerType.LabEntity)}
                  >
                    Lab entity
                  </DesignButton>
                </InfomodeWrapper>
                <InfomodeWrapper
                  infoId="lab-owner-type-wallet-button"
                  infoTitle="Wallet"
                  infoText="Mining rewards go straight to your loaded wallet’s active receive address (you must be unlocked). Use this when you want the lab chain to fund the same wallet you use elsewhere in Bitboard for practice sends and sync."
                >
                  <DesignButton
                    type="button"
                    appearance={
                      ownerType === LabOwnerType.Wallet ? 'primary' : 'secondary'
                    }
                    onClick={() => setOwnerType(LabOwnerType.Wallet)}
                  >
                    Wallet
                  </DesignButton>
                </InfomodeWrapper>
              </div>
            </div>
            {ownerType === LabOwnerType.Wallet ? (
              <div className="space-y-2">
                <Label htmlFor="target-address">Target address (active wallet)</Label>
                {walletUnlocked ? (
                  <DesignInput
                    id="target-address"
                    type="text"
                    value={currentAddress ?? ''}
                    readOnly
                    className="design-type-addresses min-w-[200px]"
                  />
                ) : (
                  <p className="design-type-regular text-muted-foreground py-2">
                    Unlock wallet to mine to it
                  </p>
                )}
              </div>
            ) : noLivingEntities ? (
              <p className="design-type-regular text-muted-foreground">
                Create at least one living lab entity on the{' '}
                <Link to="/lab/control" className="design-type-emphasis underline text-foreground">
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
                    'design-type-addresses flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2',
                    'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
                  value={selectedLabEntityId ?? ''}
                  onChange={(event) => {
                    const selectedValue = event.target.value
                    setSelectedLabEntityId(selectedValue === '' ? null : Number(selectedValue))
                  }}
                >
                  {livingEntities.map((entity) => (
                    <option key={entity.labEntityId} value={entity.labEntityId}>
                      {formatLabEntityMineOptionLabel(entity, isSegwitAddressesEnabled)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {ownerType === LabOwnerType.Wallet && activeWallet && (
              <p className="design-type-regular text-muted-foreground">Mining to: {activeWallet.name}</p>
            )}
          </div>
          <div className="border-t border-border pt-4">
            <InfomodeWrapper
              infoId="lab-mine-blocks-button"
              infoTitle="Mine blocks"
              infoText="Runs the lab miner for the number of blocks you entered. Each block can pay coinbase to your chosen target, creating spendable test coins instantly—no electricity, no real network, just a teaching sandbox."
            >
              <DesignButton
                onClick={handleMineClick}
                disabled={
                  mining ||
                  noLivingEntities ||
                  (ownerType === LabOwnerType.Wallet &&
                    walletUnlocked &&
                    (!currentAddress || !activeWallet))
                }
              >
                {mining ? 'Mining...' : 'Mine blocks'}
              </DesignButton>
            </InfomodeWrapper>
          </div>
          {unlockDialog}
        </DesignCardContent>
      </DesignCard>
    </InfomodeWrapper>
  )
}
