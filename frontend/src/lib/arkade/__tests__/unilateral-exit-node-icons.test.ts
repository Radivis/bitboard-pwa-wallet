import { describe, expect, it } from 'vitest'
import {
  formatUnilateralExitTxTypeLabel,
  resolveUnilateralExitNodeIconKind,
} from '@/lib/arkade/unilateral-exit-node-icons'

describe('unilateral-exit-node-icons', () => {
  it('maps tx types and leaves to icon kinds', () => {
    expect(resolveUnilateralExitNodeIconKind({ txType: 'commitment', isLeaf: false })).toBe(
      'commitment',
    )
    expect(resolveUnilateralExitNodeIconKind({ txType: 'checkpoint', isLeaf: false })).toBe(
      'checkpoint',
    )
    expect(resolveUnilateralExitNodeIconKind({ txType: 'tree', isLeaf: false })).toBe('tree')
    expect(resolveUnilateralExitNodeIconKind({ txType: 'ark', isLeaf: true })).toBe('leaf')
  })

  it('formats human-readable tx type labels', () => {
    expect(formatUnilateralExitTxTypeLabel('commitment', false)).toBe('Commitment')
    expect(formatUnilateralExitTxTypeLabel('ark', true)).toBe('Leaf VTXO')
  })
})
