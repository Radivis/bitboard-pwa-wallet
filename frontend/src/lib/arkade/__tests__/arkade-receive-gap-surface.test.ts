import { describe, expect, it } from 'vitest'
import {
  arkadeGenerateConfirmKind,
  arkadeHardGapConfirmBody,
  arkadeReceiveGapSurface,
  arkadeUnusedGapLabel,
  type ArkadeOffchainReceiveGap,
} from '@/lib/arkade/arkade-receive-gap-surface'

const revealed: ArkadeOffchainReceiveGap = {
  revealed: true,
  index: 0,
  receiveCount: 0,
  gap: 0,
  batchGap: 1,
  snapshotPresent: true,
}

describe('arkadeReceiveGapSurface', () => {
  it('hides the summary before a snapshot exists', () => {
    expect(
      arkadeReceiveGapSurface({ ...revealed, snapshotPresent: false, gap: 4 }),
    ).toEqual({ kind: 'hidden' })
  })

  it('hides the summary until a receive index is revealed', () => {
    expect(arkadeReceiveGapSurface({ ...revealed, revealed: false })).toEqual({ kind: 'hidden' })
  })

  it('shows the count without a gap line when the index gap is under 2', () => {
    expect(arkadeReceiveGapSurface({ ...revealed, gap: 1, receiveCount: 0 })).toEqual({
      kind: 'visible',
      receiveCount: 0,
      gapLabel: null,
    })
  })

  it('shows the gap line from 2 without the on-chain lookahead sentence', () => {
    const surface = arkadeReceiveGapSurface({ ...revealed, gap: 2 })
    expect(surface).toEqual({
      kind: 'visible',
      receiveCount: 0,
      gapLabel: arkadeUnusedGapLabel(2),
    })
    expect(arkadeUnusedGapLabel(2)).not.toContain('looks ahead')
  })
})

describe('arkadeGenerateConfirmKind', () => {
  it('reveals immediately when the cursor has not stored a key', () => {
    expect(arkadeGenerateConfirmKind({ ...revealed, revealed: false, batchGap: 2 })).toBe('none')
  })

  it('asks for the hard opt-in from the local cursor before a snapshot exists', () => {
    expect(
      arkadeGenerateConfirmKind({ ...revealed, snapshotPresent: false, gap: 20, batchGap: 2 }),
    ).toBe('hard')
  })

  it('skips the soft confirm before a snapshot exists', () => {
    expect(
      arkadeGenerateConfirmKind({ ...revealed, snapshotPresent: false, gap: 4, batchGap: 1 }),
    ).toBe('none')
  })

  it('asks softly when the index gap is at least 1 and the next key stays in the scanned batches', () => {
    expect(arkadeGenerateConfirmKind({ ...revealed, gap: 1, batchGap: 1 })).toBe('soft')
  })

  it('uses the hard dialog when the next key would make the batch gap 2', () => {
    expect(arkadeGenerateConfirmKind({ ...revealed, gap: 19, batchGap: 2 })).toBe('hard')
  })

  it('does not describe an Esplora scan in the hard explanation', () => {
    expect(arkadeHardGapConfirmBody()).not.toContain('Esplora')
    expect(arkadeHardGapConfirmBody()).toContain('20 keys at a time')
  })
})
