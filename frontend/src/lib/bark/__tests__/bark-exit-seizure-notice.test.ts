import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  barkExitChainNoticeIds,
  useBarkExitChainNoticeStore,
} from '@/lib/bark/bark-exit-seizure-notice'

const clearExitChainNotice = vi.hoisted(() => vi.fn())

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => ({ clearExitChainNotice }),
}))

describe('bark exit chain notice', () => {
  beforeEach(() => {
    useBarkExitChainNoticeStore.setState({ notice: null })
    clearExitChainNotice.mockReset()
    clearExitChainNotice.mockResolvedValue(undefined)
  })

  it('shows both lists and hides them only when both are empty', () => {
    const { showNotice } = useBarkExitChainNoticeStore.getState()
    showNotice(1, 'signet', {
      anchorSweepVtxoIds: ['vtxo-b', 'vtxo-a'],
      checkpointSeizureVtxoIds: ['vtxo-c'],
    })
    expect(barkExitChainNoticeIds(1, 'signet')).toEqual({
      anchorSweepVtxoIds: ['vtxo-a', 'vtxo-b'],
      checkpointSeizureVtxoIds: ['vtxo-c'],
    })
    expect(barkExitChainNoticeIds(2, 'signet')).toEqual({
      anchorSweepVtxoIds: [],
      checkpointSeizureVtxoIds: [],
    })

    showNotice(1, 'signet', { anchorSweepVtxoIds: [], checkpointSeizureVtxoIds: [] })
    expect(barkExitChainNoticeIds(1, 'signet')).toEqual({
      anchorSweepVtxoIds: [],
      checkpointSeizureVtxoIds: [],
    })
  })

  it('hides the banner without forgetting a different wallet', () => {
    const { showNotice, hideNotice } = useBarkExitChainNoticeStore.getState()
    showNotice(1, 'signet', { anchorSweepVtxoIds: ['vtxo-a'], checkpointSeizureVtxoIds: [] })
    hideNotice()
    expect(barkExitChainNoticeIds(1, 'signet').anchorSweepVtxoIds).toEqual([])

    showNotice(2, 'signet', { anchorSweepVtxoIds: [], checkpointSeizureVtxoIds: ['vtxo-c'] })
    showNotice(1, 'mainnet', { anchorSweepVtxoIds: [], checkpointSeizureVtxoIds: [] })
    expect(barkExitChainNoticeIds(2, 'signet').checkpointSeizureVtxoIds).toEqual(['vtxo-c'])
  })

  it('dismisses one list and leaves the other section up', async () => {
    const { showNotice, dismissNotice } = useBarkExitChainNoticeStore.getState()
    showNotice(1, 'signet', {
      anchorSweepVtxoIds: ['vtxo-a'],
      checkpointSeizureVtxoIds: ['vtxo-b'],
    })
    clearExitChainNotice.mockRejectedValueOnce(new Error('payload write failed'))

    await expect(dismissNotice(1, 'signet', 'sweep')).rejects.toThrow('payload write failed')
    expect(barkExitChainNoticeIds(1, 'signet').anchorSweepVtxoIds).toEqual(['vtxo-a'])

    await dismissNotice(1, 'signet', 'sweep')
    expect(clearExitChainNotice).toHaveBeenCalledWith('sweep')
    expect(barkExitChainNoticeIds(1, 'signet')).toEqual({
      anchorSweepVtxoIds: [],
      checkpointSeizureVtxoIds: ['vtxo-b'],
    })
  })
})
