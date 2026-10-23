import {
  exitCoinStageIconComponent,
  type ExitCoinStage,
} from '@/lib/arkade/unilateral-exit-node-icons'

function exitCoinBadgeLabel(stage: ExitCoinStage, count: number): string {
  const vtxoNoun = count === 1 ? 'VTXO' : 'VTXOs'
  switch (stage) {
    case 'exitable':
      return `${count} exitable ${vtxoNoun}`
    case 'timelocked':
      return `${count} ${vtxoNoun} waiting for timelock`
    case 'claimable':
      return `${count} claimable ${vtxoNoun}`
  }
}

function exitCoinBadgeTestId(stage: ExitCoinStage, prefix: string, suffix: string): string {
  if (stage === 'exitable') {
    return `${prefix}-vtxo-count-${suffix}`
  }
  return `${prefix}-${stage}-vtxo-count-${suffix}`
}

/** VTXO count overlay on an Arkade or Bark exit-tree node; the icon follows the exit stage. */
export function ExitTreeCoinBadge({
  count,
  stage,
  testIdPrefix,
  testIdSuffix,
}: {
  count: number
  stage: ExitCoinStage
  testIdPrefix: string
  testIdSuffix: string
}) {
  if (count <= 0) {
    return null
  }
  const StageIcon = exitCoinStageIconComponent(stage)

  return (
    <div
      className="absolute left-1/2 top-[calc(50%+10px)] flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-background px-0.5 text-amber-600 shadow-sm"
      aria-label={exitCoinBadgeLabel(stage, count)}
      data-coin-stage={stage}
      data-testid={exitCoinBadgeTestId(stage, testIdPrefix, testIdSuffix)}
    >
      {count > 1 && (
        <span className="text-[10px] font-semibold leading-none">{count}×</span>
      )}
      <StageIcon className="size-3" aria-hidden />
    </div>
  )
}
