import { describe, expect, it } from 'vitest'
import {
  arkadeRefetchIntervalWithPendingBatchIntent,
  hasPendingBatchIntent,
  hasPendingKind,
  pendingBatchIntentFromSources,
  pendingOverlapsOnchain,
  pendingBatchIntentKindLabel,
  pendingBatchIntentWaitingMessage,
} from '@/lib/arkade/arkade-pending-batch-intent'
import { ARKADE_PENDING_BATCH_INTENT_POLL_MS } from '@/lib/arkade/arkade-query-timings'
import type { ArkadePendingBatchIntent } from '@/workers/arkade-api'

const sampleIntent: ArkadePendingBatchIntent = {
  kind: 'board',
  amountSats: 1,
  registeredAt: 1,
  onchainOutpoints: [],
  vtxoOutpoints: [],
}

describe('arkade-pending-batch-intent', () => {
  it('pending_batch_intents_from_sources_prefers_boarding_list', () => {
    const boarding = { ...sampleIntent, kind: 'board' }
    const balance = { ...sampleIntent, kind: 'recover' }
    expect(pendingBatchIntentFromSources([boarding], [balance])[0]?.kind).toBe('board')
    expect(pendingBatchIntentFromSources(undefined, [balance])[0]?.kind).toBe('recover')
    expect(pendingBatchIntentFromSources(undefined, undefined)).toEqual([])
  })

  it('labels known pending-intent kinds', () => {
    expect(pendingBatchIntentKindLabel('board')).toBe('boarding')
    expect(pendingBatchIntentKindLabel('collaborative_exit')).toBe('collaborative exit')
  })

  it('describes waiting without treating it as a hard error', () => {
    expect(pendingBatchIntentWaitingMessage('board')).toContain('Waiting for the Arkade operator')
  })

  it('polls faster while a pending intent is present', () => {
    expect(arkadeRefetchIntervalWithPendingBatchIntent(true, 30_000)).toBe(
      ARKADE_PENDING_BATCH_INTENT_POLL_MS,
    )
    expect(arkadeRefetchIntervalWithPendingBatchIntent(false, 30_000)).toBe(30_000)
    expect(arkadeRefetchIntervalWithPendingBatchIntent(false, false)).toBe(false)
  })

  it('pending_overlaps_onchain_and_kind_helpers', () => {
    expect(hasPendingBatchIntent([sampleIntent])).toBe(true)
    expect(pendingOverlapsOnchain([{ ...sampleIntent, onchainOutpoints: [{ txid: 'aa', vout: 1 }] }])).toBe(true)
    expect(hasPendingKind([{ ...sampleIntent, kind: 'renew' }], 'renew')).toBe(true)
  })
})
