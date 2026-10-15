import { create } from 'zustand'
import type { NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

const EMPTY_NOTICE_IDS: readonly string[] = []

type ShownBarkExitSeizureNotice = {
  walletId: number
  networkMode: NetworkMode
  vtxoIds: readonly string[]
}

interface BarkExitSeizureNoticeState {
  /** Banner contents for the open wallet. The Bark account is the stored copy. */
  notice: ShownBarkExitSeizureNotice | null
  /** An empty list hides the notice for that wallet and network. */
  showNotice: (walletId: number, networkMode: NetworkMode, vtxoIds: readonly string[]) => void
  /** Hides the banner. Does not change the Bark account. */
  hideNotice: () => void
  /**
   * Deletes the notice on the open Bark account, then hides the banner.
   * A failed write leaves the banner up.
   */
  dismissNotice: (walletId: number, networkMode: NetworkMode) => Promise<void>
}

export const useBarkExitSeizureNoticeStore = create<BarkExitSeizureNoticeState>((set, get) => ({
  notice: null,
  showNotice: (walletId, networkMode, vtxoIds) => {
    const ids = normalizedVtxoIds(vtxoIds)
    const current = get().notice
    if (ids.length === 0) {
      if (matchesNotice(current, walletId, networkMode)) set({ notice: null })
      return
    }
    if (
      current != null &&
      matchesNotice(current, walletId, networkMode) &&
      sameIds(current.vtxoIds, ids)
    ) {
      return
    }
    set({ notice: { walletId, networkMode, vtxoIds: ids } })
  },
  hideNotice: () => {
    if (get().notice == null) return
    set({ notice: null })
  },
  dismissNotice: async (walletId, networkMode) => {
    await getBarkWorker().clearExitSeizureNotice()
    if (!matchesNotice(get().notice, walletId, networkMode)) return
    set({ notice: null })
  },
}))

/** Ids on the shown notice when it belongs to this wallet and network. */
export function barkExitSeizureNoticeIds(
  walletId: number,
  networkMode: NetworkMode,
): readonly string[] {
  const { notice } = useBarkExitSeizureNoticeStore.getState()
  if (!matchesNotice(notice, walletId, networkMode) || notice == null) return EMPTY_NOTICE_IDS
  return notice.vtxoIds
}

function matchesNotice(
  notice: ShownBarkExitSeizureNotice | null,
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
