import { create } from 'zustand'
import {
  exitNodeSweepVtxoItemsWithoutKind,
  normalizeExitNodeSweepVtxoItems,
  type BarkExitNodeSweepKind,
  type BarkExitNodeSweepVtxoItem,
} from '@/lib/bark/bark-exit-seizure'
import type { NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

const EMPTY_ITEMS: readonly BarkExitNodeSweepVtxoItem[] = []

export type ShownBarkExitChainNotice = {
  walletId: number
  networkMode: NetworkMode
  exitNodeSweepVtxoItems: readonly BarkExitNodeSweepVtxoItem[]
}

interface BarkExitChainNoticeState {
  /** Banner contents for the open wallet. The Bark account is the stored copy. */
  notice: ShownBarkExitChainNotice | null
  /** An empty item list hides the notice for that wallet and network. */
  showNotice: (
    walletId: number,
    networkMode: NetworkMode,
    items: readonly BarkExitNodeSweepVtxoItem[],
  ) => void
  /** Hides the banner. Does not change the Bark account. */
  hideNotice: () => void
  /**
   * Deletes one node kind on the open Bark account, then drops that section.
   * A failed write leaves the banner up.
   */
  dismissNotice: (
    walletId: number,
    networkMode: NetworkMode,
    kind: BarkExitNodeSweepKind,
  ) => Promise<void>
}

export const useBarkExitChainNoticeStore = create<BarkExitChainNoticeState>((set, get) => ({
  notice: null,
  showNotice: (walletId, networkMode, items) => {
    const exitNodeSweepVtxoItems = normalizeExitNodeSweepVtxoItems(items)
    const current = get().notice
    if (exitNodeSweepVtxoItems.length === 0) {
      if (matchesNotice(current, walletId, networkMode)) set({ notice: null })
      return
    }
    if (
      current != null &&
      matchesNotice(current, walletId, networkMode) &&
      sameItems(current.exitNodeSweepVtxoItems, exitNodeSweepVtxoItems)
    ) {
      return
    }
    set({ notice: { walletId, networkMode, exitNodeSweepVtxoItems } })
  },
  hideNotice: () => {
    if (get().notice == null) return
    set({ notice: null })
  },
  dismissNotice: async (walletId, networkMode, kind) => {
    await getBarkWorker().clearExitChainNotice(kind)
    const current = get().notice
    if (!matchesNotice(current, walletId, networkMode) || current == null) return
    const exitNodeSweepVtxoItems = exitNodeSweepVtxoItemsWithoutKind(
      current.exitNodeSweepVtxoItems,
      kind,
    )
    if (exitNodeSweepVtxoItems.length === 0) {
      set({ notice: null })
      return
    }
    set({ notice: { ...current, exitNodeSweepVtxoItems } })
  },
}))

/** Items on the shown notice when it belongs to this wallet and network. */
export function barkExitChainNoticeItems(
  walletId: number,
  networkMode: NetworkMode,
): readonly BarkExitNodeSweepVtxoItem[] {
  const { notice } = useBarkExitChainNoticeStore.getState()
  if (!matchesNotice(notice, walletId, networkMode) || notice == null) return EMPTY_ITEMS
  return notice.exitNodeSweepVtxoItems
}

function matchesNotice(
  notice: ShownBarkExitChainNotice | null,
  walletId: number,
  networkMode: NetworkMode,
): boolean {
  return notice != null && notice.walletId === walletId && notice.networkMode === networkMode
}

function sameItems(
  left: readonly BarkExitNodeSweepVtxoItem[],
  right: readonly BarkExitNodeSweepVtxoItem[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (item, index) => item.vtxoId === right[index]?.vtxoId && item.nodeKind === right[index]?.nodeKind,
    )
  )
}
