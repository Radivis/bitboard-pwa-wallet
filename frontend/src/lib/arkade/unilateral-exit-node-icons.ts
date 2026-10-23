import type { LucideIcon } from 'lucide-react'
import {
  Anchor,
  Coins,
  GitFork,
  HandCoins,
  Hourglass,
  Leaf,
  Milestone,
  TreePalm,
} from 'lucide-react'

export type UnilateralExitNodeIconKind =
  | 'commitment'
  | 'checkpoint'
  | 'tree'
  | 'leaf'
  | 'fallback'

export function resolveUnilateralExitNodeIconKind(params: {
  txType: string
  isLeaf: boolean
}): UnilateralExitNodeIconKind {
  if (params.isLeaf) {
    return 'leaf'
  }
  switch (params.txType) {
    case 'commitment':
      return 'commitment'
    case 'checkpoint':
      return 'checkpoint'
    case 'tree':
      return 'tree'
    default:
      return 'fallback'
  }
}

export function unilateralExitNodeIconComponent(kind: UnilateralExitNodeIconKind): LucideIcon {
  switch (kind) {
    case 'commitment':
      return Anchor
    case 'checkpoint':
      return Milestone
    case 'tree':
      return TreePalm
    case 'fallback':
      return GitFork
    case 'leaf':
      return Leaf
  }
}

/**
 * Coin badge on an exit-tree node: `exitable` before the host tx confirms, `timelocked` once it
 * has a confirmation and the exit timelock runs, `claimable` once the timelock has elapsed.
 */
export type ExitCoinStage = 'exitable' | 'timelocked' | 'claimable'

/** `trackedVtxosPastTimelock` has one entry per VTXO on the node that has exit state. */
export function resolveExitCoinStage(params: {
  trackedVtxosPastTimelock: boolean[]
  txConfirmed: boolean
}): ExitCoinStage {
  const { trackedVtxosPastTimelock, txConfirmed } = params
  if (trackedVtxosPastTimelock.length > 0 && trackedVtxosPastTimelock.every(Boolean)) {
    return 'claimable'
  }
  return txConfirmed ? 'timelocked' : 'exitable'
}

export function exitCoinStageIconComponent(stage: ExitCoinStage): LucideIcon {
  switch (stage) {
    case 'exitable':
      return Coins
    case 'timelocked':
      return Hourglass
    case 'claimable':
      return HandCoins
  }
}

export function formatUnilateralExitTxTypeLabel(txType: string, isLeaf: boolean): string {
  if (isLeaf) {
    return 'Leaf VTXO'
  }
  switch (txType) {
    case 'commitment':
      return 'Commitment'
    case 'checkpoint':
      return 'Checkpoint'
    case 'tree':
      return 'Tree'
    case 'ark':
      return 'Ark'
    case 'unspecified':
      return 'Unspecified'
    default:
      return txType
  }
}
