import { describe, expect, it } from 'vitest'
import { holdBarkEnvelopeUntilCompanionIsStored } from '@/lib/bark/hold-bark-envelope-until-companion-is-stored'

describe('holdBarkEnvelopeUntilCompanionIsStored', () => {
  it('commits the envelope edit after the companion record is stored', async () => {
    const order: string[] = []

    const result = await holdBarkEnvelopeUntilCompanionIsStored({
      editEnvelope: async () => {
        order.push('edit')
        return 'idle'
      },
      storeCompanion: async (edited) => {
        order.push(`companion:${edited}`)
        return ['vtxo-a']
      },
      commitEnvelope: async () => {
        order.push('commit')
      },
      revertEnvelope: async () => {
        order.push('revert')
      },
      revertFailureWarning: 'restore failed',
    })

    expect(result).toEqual({ edited: 'idle', companion: ['vtxo-a'] })
    expect(order).toEqual(['edit', 'companion:idle', 'commit'])
  })

  it('reverts the envelope edit when the companion record is not stored', async () => {
    const order: string[] = []

    await expect(
      holdBarkEnvelopeUntilCompanionIsStored({
        editEnvelope: async () => {
          order.push('edit')
          return 'idle'
        },
        storeCompanion: async () => {
          order.push('companion')
          throw new Error('companion was not stored')
        },
        commitEnvelope: async () => {
          order.push('commit')
        },
        revertEnvelope: async () => {
          order.push('revert')
        },
        revertFailureWarning: 'restore failed',
      }),
    ).rejects.toThrow('companion was not stored')

    expect(order).toEqual(['edit', 'companion', 'revert'])
  })

  it('does not revert when the envelope edit itself fails', async () => {
    const order: string[] = []

    await expect(
      holdBarkEnvelopeUntilCompanionIsStored({
        editEnvelope: async () => {
          order.push('edit')
          throw new Error('edit failed')
        },
        storeCompanion: async () => {
          order.push('companion')
          return []
        },
        commitEnvelope: async () => {
          order.push('commit')
        },
        revertEnvelope: async () => {
          order.push('revert')
        },
        revertFailureWarning: 'restore failed',
      }),
    ).rejects.toThrow('edit failed')

    expect(order).toEqual(['edit'])
  })

  it('reverts the envelope edit when committing it fails', async () => {
    const order: string[] = []

    await expect(
      holdBarkEnvelopeUntilCompanionIsStored({
        editEnvelope: async () => {
          order.push('edit')
          return 'idle'
        },
        storeCompanion: async () => {
          order.push('companion')
          return []
        },
        commitEnvelope: async () => {
          order.push('commit')
          throw new Error('commit failed')
        },
        revertEnvelope: async () => {
          order.push('revert')
        },
        revertFailureWarning: 'restore failed',
      }),
    ).rejects.toThrow('commit failed')

    expect(order).toEqual(['edit', 'companion', 'commit', 'revert'])
  })
})
