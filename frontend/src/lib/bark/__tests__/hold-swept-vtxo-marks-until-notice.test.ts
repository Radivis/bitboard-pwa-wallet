import { describe, expect, it } from 'vitest'
import { holdSweptVtxoMarksUntilNoticeIsStored } from '@/lib/bark/hold-swept-vtxo-marks-until-notice'

describe('holdSweptVtxoMarksUntilNoticeIsStored', () => {
  it('commits the spent marks after the seizure notice is stored', async () => {
    const order: string[] = []

    const result = await holdSweptVtxoMarksUntilNoticeIsStored({
      barkSync: async () => {
        order.push('sync')
        return 'idle'
      },
      mergeNotice: async (synced) => {
        order.push(`merge:${synced}`)
        return ['vtxo-a']
      },
      commitSweptVtxoMarks: async () => {
        order.push('commit')
      },
      revertSweptVtxoMarks: async () => {
        order.push('revert')
      },
    })

    expect(result).toEqual({ synced: 'idle', merged: ['vtxo-a'] })
    expect(order).toEqual(['sync', 'merge:idle', 'commit'])
  })

  it('restores swept coins when the notice is not stored', async () => {
    const order: string[] = []

    await expect(
      holdSweptVtxoMarksUntilNoticeIsStored({
        barkSync: async () => {
          order.push('sync')
          return 'idle'
        },
        mergeNotice: async () => {
          order.push('merge')
          throw new Error('notice was not stored')
        },
        commitSweptVtxoMarks: async () => {
          order.push('commit')
        },
        revertSweptVtxoMarks: async () => {
          order.push('revert')
        },
      }),
    ).rejects.toThrow('notice was not stored')

    expect(order).toEqual(['sync', 'merge', 'revert'])
  })

  it('does not restore coins when the sync itself fails', async () => {
    const order: string[] = []

    await expect(
      holdSweptVtxoMarksUntilNoticeIsStored({
        barkSync: async () => {
          order.push('sync')
          throw new Error('sync failed')
        },
        mergeNotice: async () => {
          order.push('merge')
          return []
        },
        commitSweptVtxoMarks: async () => {
          order.push('commit')
        },
        revertSweptVtxoMarks: async () => {
          order.push('revert')
        },
      }),
    ).rejects.toThrow('sync failed')

    expect(order).toEqual(['sync'])
  })

  it('restores swept coins when committing the spent marks fails', async () => {
    const order: string[] = []

    await expect(
      holdSweptVtxoMarksUntilNoticeIsStored({
        barkSync: async () => {
          order.push('sync')
          return 'idle'
        },
        mergeNotice: async () => {
          order.push('merge')
          return []
        },
        commitSweptVtxoMarks: async () => {
          order.push('commit')
          throw new Error('commit failed')
        },
        revertSweptVtxoMarks: async () => {
          order.push('revert')
        },
      }),
    ).rejects.toThrow('commit failed')

    expect(order).toEqual(['sync', 'merge', 'commit', 'revert'])
  })
})
