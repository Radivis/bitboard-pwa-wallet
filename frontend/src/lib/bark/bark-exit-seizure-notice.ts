import { create } from 'zustand'
import type { BarkExitChainNoticeKind } from '@/lib/bark/bark-exit-seizure'
import type { NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

const EMPTY_NOTICE_IDS: readonly string[] = []

export type ShownBarkExitChainNotice = {
  walletId: number
  networkMode: NetworkMode
  anchorSweepVtxoIds: readonly string[]
  checkpointSeizureVtxoIds: readonly string[]
}

export type BarkExitChainNoticeLists = {
  anchorSweepVtxoIds: readonly string[]
  checkpointSeizureVtxoIds: readonly string[]
}

interface BarkExitChainNoticeState {
  /** Banner contents for the open wallet. The Bark account is the stored copy. */
  notice: ShownBarkExitChainNotice | null
  /** Empty lists hide the notice for that wallet and network. */
  showNotice: (walletId: number, networkMode: NetworkMode, lists: BarkExitChainNoticeLists) => void
  /** Hides the banner. Does not change the Bark account. */
  hideNotice: () => void
  /**
   * Deletes one list on the open Bark account, then drops that section.
   * A failed write leaves the banner up.
   */
  dismissNotice: (
    walletId: number,
    networkMode: NetworkMode,
    kind: BarkExitChainNoticeKind,
  ) => Promise<void>
}

export const useBarkExitChainNoticeStore = create<BarkExitChainNoticeState>((set, get) => ({
  notice: null,
  showNotice: (walletId, networkMode, lists) => {
    const anchorSweepVtxoIds = normalizedVtxoIds(lists.anchorSweepVtxoIds)
    const checkpointSeizureVtxoIds = normalizedVtxoIds(lists.checkpointSeizureVtxoIds)
    const current = get().notice
    if (anchorSweepVtxoIds.length === 0 && checkpointSeizureVtxoIds.length === 0) {
      if (matchesNotice(current, walletId, networkMode)) set({ notice: null })
      return
    }
    if (
      current != null &&
      matchesNotice(current, walletId, networkMode) &&
      sameIds(current.anchorSweepVtxoIds, anchorSweepVtxoIds) &&
      sameIds(current.checkpointSeizureVtxoIds, checkpointSeizureVtxoIds)
    ) {
      return
    }
    set({ notice: { walletId, networkMode, anchorSweepVtxoIds, checkpointSeizureVtxoIds } })
  },
  hideNotice: () => {
    if (get().notice == null) return
    set({ notice: null })
  },
  dismissNotice: async (walletId, networkMode, kind) => {
    await getBarkWorker().clearExitChainNotice(kind)
    const current = get().notice
    if (!matchesNotice(current, walletId, networkMode) || current == null) return
    const next = {
      ...current,
      anchorSweepVtxoIds: kind === 'sweep' ? EMPTY_NOTICE_IDS : current.anchorSweepVtxoIds,
      checkpointSeizureVtxoIds:
        kind === 'seizure' ? EMPTY_NOTICE_IDS : current.checkpointSeizureVtxoIds,
    }
    if (next.anchorSweepVtxoIds.length === 0 && next.checkpointSeizureVtxoIds.length === 0) {
      set({ notice: null })
      return
    }
    set({ notice: next })
  },
}))

/** Ids on the shown notice when it belongs to this wallet and network. */
export function barkExitChainNoticeIds(
  walletId: number,
  networkMode: NetworkMode,
): BarkExitChainNoticeLists {
  const { notice } = useBarkExitChainNoticeStore.getState()
  if (!matchesNotice(notice, walletId, networkMode) || notice == null) {
    return { anchorSweepVtxoIds: EMPTY_NOTICE_IDS, checkpointSeizureVtxoIds: EMPTY_NOTICE_IDS }
  }
  return {
    anchorSweepVtxoIds: notice.anchorSweepVtxoIds,
    checkpointSeizureVtxoIds: notice.checkpointSeizureVtxoIds,
  }
}

function matchesNotice(
  notice: ShownBarkExitChainNotice | null,
  walletId: number,
  networkMode: NetworkMode,
): boolean {
  return notice != null && notice.walletId === walletId && notice.networkMode === networkMode
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function normalizedVtxoIds(vtxoIds: readonly string[]): string[] {
  return [...new Set(vtxoIds.filter((id) => id.length > 0))].sort()
}
