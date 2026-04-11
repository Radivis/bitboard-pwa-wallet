import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import {
  useLabSetBlockWeightLimitMutation,
  useLabSetMinerSubsidySatsMutation,
} from '@/hooks/useLabMutations'
import {
  LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  LAB_DEFAULT_MINER_SUBSIDY_SATS,
  LAB_MAX_BLOCKS_PER_MINE,
  LAB_MIN_BLOCK_WEIGHT_UNITS,
  normalizeMinerSubsidySats,
} from '@/workers/lab-api'

export function LabRulesCard() {
  const { data: labState } = useLabChainStateQuery()
  const setLimit = useLabSetBlockWeightLimitMutation()
  const setMinerSubsidy = useLabSetMinerSubsidySatsMutation()
  const [draftLimitWu, setDraftLimitWu] = useState(
    String(LAB_DEFAULT_BLOCK_WEIGHT_UNITS),
  )
  const [subsidyEditMode, setSubsidyEditMode] = useState(false)
  const [draftSubsidySats, setDraftSubsidySats] = useState(
    String(LAB_DEFAULT_MINER_SUBSIDY_SATS),
  )

  useEffect(() => {
    if (labState != null) {
      setDraftLimitWu(String(labState.blockWeightLimit))
      if (!subsidyEditMode) {
        setDraftSubsidySats(String(labState.minerSubsidySats))
      }
    }
  }, [labState, subsidyEditMode])

  const currentSubsidySats =
    labState?.minerSubsidySats ?? LAB_DEFAULT_MINER_SUBSIDY_SATS

  function applyHalfSubsidy() {
    const next = Math.max(1, Math.floor(currentSubsidySats / 2))
    setMinerSubsidy.mutate(next)
  }

  function saveSubsidyFromDraft() {
    const parsed = Number.parseInt(draftSubsidySats.trim(), 10)
    if (!Number.isFinite(parsed)) return
    const normalized = normalizeMinerSubsidySats(parsed)
    setMinerSubsidy.mutate(normalized, {
      onSuccess: () => {
        setSubsidyEditMode(false)
        setDraftSubsidySats(String(normalized))
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules</CardTitle>
        <CardDescription>
          How the lab simulation works and how it differs from Bitcoin mainnet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-3 text-sm">
          <li>
            <strong>No Proof of Work.</strong> In the lab, new blocks are created by clicking
            &quot;Mine blocks&quot;. On mainnet, miners must solve a cryptographic puzzle
            (Proof of Work) to produce a valid block. You can mine at most{' '}
            {LAB_MAX_BLOCKS_PER_MINE} blocks per click so the app stays responsive; run mining
            again if you need more height.
          </li>
          <li>
            <strong>Immediate coinbase spendability.</strong> Newly mined coins can be spent
            immediately in the lab. On mainnet, coinbase outputs require 100 confirmations
            before they can be spent.
          </li>
          <li>
            <strong>Mempool first.</strong> New transactions enter the mempool and stay there
            until a block is mined. Mining a block includes mempool transactions and confirms
            them.
          </li>
          <li>
            <strong>Block weight limit.</strong> Each block has a maximum total size for
            non-coinbase transactions, measured in weight units (WU), like Bitcoin&apos;s block
            weight. The minimum is {LAB_MIN_BLOCK_WEIGHT_UNITS} WU so a block can fit several
            typical transactions. The default numeric limit is intentionally tiny compared to
            mainnet so you can see congestion. Changing the limit below only affects{' '}
            <em>future</em> blocks; past blocks are unchanged.
          </li>
          <li>
            <strong>Miner subsidy.</strong> Each mined block creates new coins paid in the
            coinbase (plus transaction fees). The subsidy you set below applies only to{' '}
            <em>future</em> blocks; amounts already mined stay as they are.
          </li>
          <li>
            <strong>Transaction fees go to the miner.</strong> When a block is mined, all
            fees from the included transactions are added to the coinbase output, just like
            on mainnet.
          </li>
          <li>
            <strong>One spend per UTXO.</strong> Each UTXO can only be spent once in a
            block. If two mempool transactions try to spend the same UTXO (double-spend),
            the miner prefers the one with the higher fee rate (fee per vByte). Equal fee
            rates are ordered deterministically by transaction id. The losing transaction is
            discarded from the mempool entirely.
          </li>
          <li>
            <strong>Balances reflect confirmed UTXOs only.</strong> Unconfirmed (mempool)
            spends do not reduce your balance until the block is mined. You can create
            conflicting transactions to observe this.
          </li>
        </ul>

        <div className="space-y-6 rounded-lg border border-border/80 bg-muted/30 p-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const parsed = Number.parseInt(draftLimitWu.trim(), 10)
              if (!Number.isFinite(parsed) || parsed < LAB_MIN_BLOCK_WEIGHT_UNITS) return
              setLimit.mutate(parsed)
            }}
          >
            <div className="flex min-w-[12rem] flex-col gap-2">
              <Label htmlFor="lab-block-weight-units">Max non-coinbase weight units (WU) per block</Label>
              <Input
                id="lab-block-weight-units"
                inputMode="numeric"
                min={LAB_MIN_BLOCK_WEIGHT_UNITS}
                type="number"
                value={draftLimitWu}
                onChange={(ev) => setDraftLimitWu(ev.target.value)}
              />
            </div>
            <Button disabled={setLimit.isPending} type="submit" variant="secondary">
              Apply limit
            </Button>
          </form>

          <div className="flex flex-col gap-3 border-t border-border/60 pt-6">
            <Label id="lab-miner-subsidy-label">Miner subsidy (sats)</Label>
            <div className="flex flex-wrap items-center gap-3">
              {subsidyEditMode ? (
                <Input
                  aria-labelledby="lab-miner-subsidy-label"
                  className="max-w-[14rem] font-mono tabular-nums"
                  id="lab-miner-subsidy-input"
                  inputMode="numeric"
                  min={1}
                  type="number"
                  value={draftSubsidySats}
                  onChange={(ev) => setDraftSubsidySats(ev.target.value)}
                />
              ) : (
                <span
                  aria-labelledby="lab-miner-subsidy-label"
                  className="min-w-[8rem] font-mono text-base tabular-nums"
                >
                  {currentSubsidySats.toLocaleString()}
                </span>
              )}
              <Button
                disabled={
                  subsidyEditMode || setMinerSubsidy.isPending || labState == null
                }
                onClick={() => {
                  applyHalfSubsidy()
                }}
                type="button"
                variant="secondary"
              >
                Half
              </Button>
              {subsidyEditMode ? (
                <Button
                  disabled={setMinerSubsidy.isPending}
                  onClick={() => {
                    saveSubsidyFromDraft()
                  }}
                  type="button"
                  variant="secondary"
                >
                  Save new amount
                </Button>
              ) : (
                <Button
                  disabled={labState == null}
                  onClick={() => {
                    setDraftSubsidySats(String(currentSubsidySats))
                    setSubsidyEditMode(true)
                  }}
                  type="button"
                  variant="secondary"
                >
                  Change to fixed amount
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
