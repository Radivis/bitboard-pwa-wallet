import type { LucideIcon } from 'lucide-react'
import { Anchor, GitFork, Leaf, Milestone, TreePalm } from 'lucide-react'

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
