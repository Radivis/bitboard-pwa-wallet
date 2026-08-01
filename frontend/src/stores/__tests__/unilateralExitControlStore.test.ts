import { beforeEach, describe, expect, it } from 'vitest'
import { useUnilateralExitControlStore } from '@/stores/unilateralExitControlStore'

const sharedTxid = 'cc'.repeat(32)
const leafSiblingA = { txid: sharedTxid, vout: 0 }
const leafSiblingB = { txid: sharedTxid, vout: 1 }
const leafOther = { txid: 'dd'.repeat(32), vout: 0 }

describe('unilateralExitControlStore', () => {
  beforeEach(() => {
    useUnilateralExitControlStore.getState().reset()
  })

  it('toggleLeafTxGroup selects and deselects all sibling outpoints atomically', () => {
    const store = useUnilateralExitControlStore.getState()
    store.toggleLeafTxGroup([leafSiblingA, leafSiblingB])
    expect(useUnilateralExitControlStore.getState().selectedLeafOutpoints).toEqual([
      leafSiblingA,
      leafSiblingB,
    ])

    store.toggleLeafTxGroup([leafSiblingA, leafSiblingB])
    expect(useUnilateralExitControlStore.getState().selectedLeafOutpoints).toEqual([])
  })

  it('toggleLeafTxGroup ignores empty groups', () => {
    const store = useUnilateralExitControlStore.getState()
    store.toggleLeafTxGroup([leafSiblingA, leafSiblingB])
    store.toggleLeafTxGroup([])

    expect(useUnilateralExitControlStore.getState().selectedLeafOutpoints).toEqual([
      leafSiblingA,
      leafSiblingB,
    ])
  })

  it('seedSelectionFromInProgress selects full sibling groups from topology', () => {
    const store = useUnilateralExitControlStore.getState()
    store.seedSelectionFromInProgress([leafSiblingA], [leafSiblingA, leafSiblingB, leafOther])

    expect(useUnilateralExitControlStore.getState().selectedLeafOutpoints).toEqual([
      leafSiblingA,
      leafSiblingB,
    ])
  })

  it('bumps graphRenderEpoch on each visit signal', () => {
    const store = useUnilateralExitControlStore.getState()
    expect(store.graphRenderEpoch).toBe(0)
    store.bumpGraphRenderEpoch()
    store.bumpGraphRenderEpoch()
    expect(useUnilateralExitControlStore.getState().graphRenderEpoch).toBe(2)
  })
})
