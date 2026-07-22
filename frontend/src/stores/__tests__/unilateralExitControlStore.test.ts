import { beforeEach, describe, expect, it } from 'vitest'
import { useUnilateralExitControlStore } from '@/stores/unilateralExitControlStore'

const leafA = { txid: 'aa'.repeat(32), vout: 0 }
const leafB = { txid: 'bb'.repeat(32), vout: 1 }

describe('unilateralExitControlStore', () => {
  beforeEach(() => {
    useUnilateralExitControlStore.getState().reset()
  })

  it('toggles leaf selection and keeps jobStarted across reads', () => {
    const store = useUnilateralExitControlStore.getState()
    store.toggleLeafOutpoint(leafA)
    store.setJobStarted(true)

    expect(useUnilateralExitControlStore.getState().selectedLeafOutpoints).toEqual([leafA])
    expect(useUnilateralExitControlStore.getState().jobStarted).toBe(true)

    store.toggleLeafOutpoint(leafA)
    expect(useUnilateralExitControlStore.getState().selectedLeafOutpoints).toEqual([])
    expect(useUnilateralExitControlStore.getState().jobStarted).toBe(true)
  })

  it('adds multiple leaves without duplicates', () => {
    const store = useUnilateralExitControlStore.getState()
    store.toggleLeafOutpoint(leafA)
    store.toggleLeafOutpoint(leafB)
    store.toggleLeafOutpoint(leafA)

    expect(useUnilateralExitControlStore.getState().selectedLeafOutpoints).toEqual([leafB])
  })

  it('bumps graphRenderEpoch on each visit signal', () => {
    const store = useUnilateralExitControlStore.getState()
    expect(store.graphRenderEpoch).toBe(0)
    store.bumpGraphRenderEpoch()
    store.bumpGraphRenderEpoch()
    expect(useUnilateralExitControlStore.getState().graphRenderEpoch).toBe(2)
  })
})
