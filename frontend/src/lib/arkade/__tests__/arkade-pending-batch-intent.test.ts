import { beforeEach, describe, expect, it } from 'vitest'
import {
  arkadeRefetchIntervalWithPendingBatchIntent,
  classifyPendingIntentDisappearance,
  hasPendingBatchIntent,
  hasPendingKind,
  isIntentSubmitPhase1,
  pendingBatchIntentFromSources,
  pendingOverlapsOnchain,
  pendingBatchIntentKindLabel,
  pendingBatchIntentProcessingMessage,
  pendingBatchIntentSucceededMessage,
  pendingBatchIntentWaitingMessage,
  pendingIntentAllowsCancel,
  pendingIntentAllowsRetry,
  pendingIntentBannerPhase,
  resetPendingBatchIntentSessionTracking,
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
  beforeEach(() => {
    resetPendingBatchIntentSessionTracking()
  })

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

  it('describes processing and kind-specific success copy', () => {
    expect(pendingBatchIntentProcessingMessage('board')).toContain(
      'processing your boarding',
    )
    expect(pendingBatchIntentSucceededMessage('board')).toBe('Boarding settlement completed')
    expect(pendingBatchIntentSucceededMessage('recover')).toBe('Recoverable VTXOs settled')
    expect(pendingBatchIntentSucceededMessage('renew')).toBe('VTXOs renewed')
    expect(pendingBatchIntentSucceededMessage('collaborative_exit')).toBe(
      'Collaborative exit completed',
    )
    expect(pendingBatchIntentSucceededMessage('migrate')).toBe(
      'Signer migration batch completed',
    )
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

  it('reads persisted lifecycle phase and boarding action gates', () => {
    const processingBoard = {
      ...sampleIntent,
      kind: 'board' as const,
      lifecyclePhase: 'processing' as const,
    }
    const timedOutBoard = {
      ...sampleIntent,
      kind: 'board' as const,
      lifecyclePhase: 'timed_out' as const,
    }
    const processingRecover = {
      ...sampleIntent,
      kind: 'recover' as const,
      vtxoOutpoints: [{ txid: 'aa', vout: 0 }],
      lifecyclePhase: 'processing' as const,
    }
    expect(pendingIntentBannerPhase(processingBoard)).toBe('processing')
    expect(pendingIntentBannerPhase(timedOutBoard)).toBe('timed_out')
    expect(pendingIntentAllowsCancel(processingBoard)).toBe(false)
    expect(pendingIntentAllowsRetry(processingBoard)).toBe(false)
    expect(pendingIntentAllowsRetry(timedOutBoard)).toBe(true)
    expect(pendingIntentAllowsCancel(processingRecover)).toBe(true)
    expect(pendingIntentAllowsRetry(processingRecover)).toBe(true)
  })

  it('submit_phase1_only_while_mutation_pending_without_persisted_record', () => {
    expect(isIntentSubmitPhase1({ mutationPending: true, pendingForAction: false })).toBe(true)
    expect(isIntentSubmitPhase1({ mutationPending: true, pendingForAction: true })).toBe(false)
    expect(isIntentSubmitPhase1({ mutationPending: false, pendingForAction: false })).toBe(false)
  })

  it('classifies cancel, mutation-settled, boarding expiry, and success disappearances', () => {
    expect(
      classifyPendingIntentDisappearance({
        previousIntent: sampleIntent,
        cancelled: true,
        settledByMutation: false,
        boardingExpiredSats: 0,
      }),
    ).toEqual({ type: 'cancelled' })
    expect(
      classifyPendingIntentDisappearance({
        previousIntent: { ...sampleIntent, kind: 'recover' },
        cancelled: false,
        settledByMutation: true,
        boardingExpiredSats: 0,
      }),
    ).toEqual({ type: 'silent' })
    expect(
      classifyPendingIntentDisappearance({
        previousIntent: sampleIntent,
        cancelled: false,
        settledByMutation: false,
        boardingExpiredSats: 1,
      }),
    ).toEqual({ type: 'silent' })
    expect(
      classifyPendingIntentDisappearance({
        previousIntent: { ...sampleIntent, kind: 'renew' },
        cancelled: false,
        settledByMutation: false,
        boardingExpiredSats: 0,
      }),
    ).toEqual({ type: 'succeeded', kind: 'renew' })
  })
})
