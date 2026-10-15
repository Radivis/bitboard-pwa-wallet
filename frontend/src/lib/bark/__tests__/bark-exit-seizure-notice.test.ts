import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  barkExitSeizureNoticeIds,
  useBarkExitSeizureNoticeStore,
} from '@/lib/bark/bark-exit-seizure-notice'

const clearExitSeizureNotice = vi.hoisted(() => vi.fn())

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => ({ clearExitSeizureNotice }),
}))

describe('bark exit seizure notice', () => {
  beforeEach(() => {
    useBarkExitSeizureNoticeStore.setState({ notice: null })
    clearExitSeizureNotice.mockReset()
    clearExitSeizureNotice.mockResolvedValue(undefined)
  })

  it('shows a notice from the Bark account and hides an empty one', () => {
    const { showNotice } = useBarkExitSeizureNoticeStore.getState()
    showNotice(1, 'signet', ['vtxo-b', 'vtxo-a'])
    expect(barkExitSeizureNoticeIds(1, 'signet')).toEqual(['vtxo-a', 'vtxo-b'])
    expect(barkExitSeizureNoticeIds(2, 'signet')).toEqual([])

    showNotice(1, 'signet', [])
    expect(barkExitSeizureNoticeIds(1, 'signet')).toEqual([])
  })

  it('hides the banner without forgetting a different wallet', () => {
    const { showNotice, hideNotice } = useBarkExitSeizureNoticeStore.getState()
    showNotice(1, 'signet', ['vtxo-a'])
    hideNotice()
    expect(barkExitSeizureNoticeIds(1, 'signet')).toEqual([])

    showNotice(2, 'signet', ['vtxo-c'])
    showNotice(1, 'mainnet', [])
    expect(barkExitSeizureNoticeIds(2, 'signet')).toEqual(['vtxo-c'])
  })

  it('dismisses only after the Bark account write succeeds', async () => {
    const { showNotice, dismissNotice } = useBarkExitSeizureNoticeStore.getState()
    showNotice(1, 'signet', ['vtxo-a'])
    clearExitSeizureNotice.mockRejectedValueOnce(new Error('payload write failed'))

    await expect(dismissNotice(1, 'signet')).rejects.toThrow('payload write failed')
    expect(barkExitSeizureNoticeIds(1, 'signet')).toEqual(['vtxo-a'])

    await dismissNotice(1, 'signet')
    expect(clearExitSeizureNotice).toHaveBeenCalledTimes(2)
    expect(barkExitSeizureNoticeIds(1, 'signet')).toEqual([])
  })
})