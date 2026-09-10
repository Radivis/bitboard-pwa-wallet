import { afterEach, describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { vtxoExitMachine, vtxoExitPhaseFromMachineState } from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit.machine'
import type { ArkadeVtxoExitRecordDto } from '@/workers/arkade-api'

const leaf: ArkadeVtxoExitRecordDto = {
  txid: 'aa'.repeat(32),
  vout: 0,
  amountSats: 50_000,
  phase: 'tagged',
  hostTxid: 'bb'.repeat(32),
  taggedAt: 1_700_000_000,
}

const startedActors: Array<ReturnType<typeof createActor>> = []

function createVtxoActor(record: ArkadeVtxoExitRecordDto = leaf) {
  const actor = createActor(vtxoExitMachine, { input: record })
  actor.start()
  startedActors.push(actor)
  return actor
}

describe('vtxoExitMachine', () => {
  afterEach(() => {
    for (const actor of startedActors) {
      actor.stop()
    }
    startedActors.length = 0
  })

  it('hydrate_jumps_from_tagged_to_unrolled', () => {
    const actor = createVtxoActor()
    expect(actor.getSnapshot().value).toBe('tagged')

    actor.send({ type: 'HYDRATE', phase: 'unrolled' })

    expect(actor.getSnapshot().value).toBe('unrolled')
    expect(actor.getSnapshot().context.phase).toBe('unrolled')
  })

  it('complete_rejected_unless_complete_ready', () => {
    const actor = createVtxoActor()
    actor.send({ type: 'COMPLETE' })
    expect(actor.getSnapshot().value).toBe('tagged')

    actor.send({ type: 'HYDRATE', phase: 'complete_ready' })
    actor.send({ type: 'COMPLETE' })
    expect(actor.getSnapshot().value).toBe('completing')
  })

  it('untag_only_from_tagged', () => {
    const actor = createVtxoActor({ ...leaf, phase: 'host_broadcast_attempted' })
    expect(actor.getSnapshot().value).toBe('host_broadcast_attempted')
    actor.send({ type: 'UNTAG' })
    expect(actor.getSnapshot().value).toBe('host_broadcast_attempted')

    actor.send({ type: 'HYDRATE', phase: 'tagged' })
    actor.send({ type: 'UNTAG' })
    expect(actor.getSnapshot().value).toBe('idle')
    expect(actor.getSnapshot().context.phase).toBe('tagged')
    expect(vtxoExitPhaseFromMachineState('idle')).toBeNull()
  })

  it('child_has_no_after_delays', () => {
    const config = vtxoExitMachine.config
    expect(config.after).toBeUndefined()
    const states = config.states ?? {}
    for (const stateConfig of Object.values(states)) {
      if (stateConfig != null && typeof stateConfig === 'object' && 'after' in stateConfig) {
        expect(stateConfig.after).toBeUndefined()
      }
    }
  })
})
