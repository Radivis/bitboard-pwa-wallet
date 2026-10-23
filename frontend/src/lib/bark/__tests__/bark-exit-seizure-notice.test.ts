import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarkExitNodeSweepVtxoItem } from '@/lib/bark/bark-exit-seizure'
import {
  barkExitChainNoticeItems,
  useBarkExitChainNoticeStore,
} from '@/lib/bark/bark-exit-seizure-notice'

const clearExitChainNotice = vi.hoisted(() => vi.fn())

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => ({ clearExitChainNotice }),
}))

function items(entries: Array<[string, BarkExitNodeSweepVtxoItem['nodeKind']]>): BarkExitNodeSweepVtxoItem[] {
  return entries.map(([vtxoId, nodeKind]) => ({ vtxoId, nodeKind }))
}

describe('bark exit chain notice', () => {
  beforeEach(() => {
    useBarkExitChainNoticeStore.setState({ notice: null })
    clearExitChainNotice.mockReset()
    clearExitChainNotice.mockResolvedValue(undefined)
  })

  it('shows the items and hides them only when the list is empty', () => {
    const { showNotice } = useBarkExitChainNoticeStore.getState()
    showNotice(
      1,
      'signet',
      items([
        ['vtxo-b', 'anchor'],
        ['vtxo-a', 'anchor'],
        ['vtxo-c', 'checkpoint'],
      ]),
    )
    expect(barkExitChainNoticeItems(1, 'signet')).toEqual(
      items([
        ['vtxo-a', 'anchor'],
        ['vtxo-b', 'anchor'],
        ['vtxo-c', 'checkpoint'],
      ]),
    )
    expect(barkExitChainNoticeItems(2, 'signet')).toEqual([])

    showNotice(1, 'signet', [])
    expect(barkExitChainNoticeItems(1, 'signet')).toEqual([])
  })

  it('hides the banner without forgetting a different wallet', () => {
    const { showNotice, hideNotice } = useBarkExitChainNoticeStore.getState()
    showNotice(1, 'signet', items([['vtxo-a', 'anchor']]))
    hideNotice()
    expect(barkExitChainNoticeItems(1, 'signet')).toEqual([])

    showNotice(2, 'signet', items([['vtxo-c', 'checkpoint']]))
    showNotice(1, 'mainnet', [])
    expect(barkExitChainNoticeItems(2, 'signet')).toEqual(items([['vtxo-c', 'checkpoint']]))
  })

  it('dismisses one node kind and leaves the other items up', async () => {
    const { showNotice, dismissNotice } = useBarkExitChainNoticeStore.getState()
    showNotice(
      1,
      'signet',
      items([
        ['vtxo-a', 'anchor'],
        ['vtxo-b', 'checkpoint'],
      ]),
    )
    clearExitChainNotice.mockRejectedValueOnce(new Error('payload write failed'))

    await expect(dismissNotice(1, 'signet', 'anchor')).rejects.toThrow('payload write failed')
    expect(barkExitChainNoticeItems(1, 'signet')).toEqual(
      items([
        ['vtxo-a', 'anchor'],
        ['vtxo-b', 'checkpoint'],
      ]),
    )

    await dismissNotice(1, 'signet', 'anchor')
    expect(clearExitChainNotice).toHaveBeenCalledWith('anchor')
    expect(barkExitChainNoticeItems(1, 'signet')).toEqual(items([['vtxo-b', 'checkpoint']]))
  })
})
