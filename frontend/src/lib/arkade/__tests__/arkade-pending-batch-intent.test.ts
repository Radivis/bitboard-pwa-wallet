import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOARDING_REGISTER_INTENT_TTL_SECS,
  arkadeRefetchIntervalWithPendingBatchIntent,
  classifyPendingIntentDisappearance,
  hasPendingBatchIntent,
  hasPendingKind,
  isBoardingOnlyPendingIntent,
  isIntentSubmitPhase1,
  pendingBatchIntentFromSources,
  pendingOverlapsOnchain,
  pendingBatchIntentDestinationAddress,
  pendingBatchIntentKindLabel,
  pendingBatchIntentProcessingMessage,
  pendingBatchIntentSucceededMessage,
  pendingBatchIntentTimedOutMessage,
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

  it('pending_batch_intents_from_sources_keeps_balance_when_boarding_list_empty', () => {
    const balance = {
      ...sampleIntent,
      kind: 'recover' as const,
      vtxoOutpoints: [{ txid: 'aa', vout: 0 }],
    }
    expect(pendingBatchIntentFromSources([], [balance])).toEqual([balance])
  })

  it('pending_batch_intents_from_sources_merges_by_key_preferring_boarding', () => {
    const boarding = {
      ...sampleIntent,
      kind: 'board' as const,
      amountSats: 2,
      onchainOutpoints: [{ txid: 'aa', vout: 1 }],
    }
    const overlappingBalance = {
      ...sampleIntent,
      kind: 'board' as const,
      amountSats: 1,
      onchainOutpoints: [{ txid: 'aa', vout: 1 }],
    }
    const extraBalance = {
      ...sampleIntent,
      kind: 'recover' as const,
      vtxoOutpoints: [{ txid: 'bb', vout: 0 }],
    }
    const merged = pendingBatchIntentFromSources(
      [boarding],
      [overlappingBalance, extraBalance],
    )
    expect(merged).toHaveLength(2)
    expect(merged.find((intent) => intent.kind === 'board')?.amountSats).toBe(2)
    expect(merged.find((intent) => intent.kind === 'recover')).toEqual(extraBalance)
  })

  it('labels known pending-intent kinds', () => {
    expect(pendingBatchIntentKindLabel('board')).toBe('boarding')
    expect(pendingBatchIntentKindLabel('collaborative_exit')).toBe('collaborative exit')
  })

  it('pending_batch_intent_destination_address_returns_trimmed', () => {
    expect(
      pendingBatchIntentDestinationAddress({
        ...sampleIntent,
        kind: 'collaborative_exit',
        destinationAddress: '  tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh  ',
      }),
    ).toBe('tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')
  })

  it('pending_batch_intent_destination_address_omits_blank', () => {
    expect(pendingBatchIntentDestinationAddress(sampleIntent)).toBeNull()
    expect(
      pendingBatchIntentDestinationAddress({
        ...sampleIntent,
        destinationAddress: '   ',
      }),
    ).toBeNull()
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
      onchainOutpoints: [{ txid: 'aa', vout: 1 }],
      lifecyclePhase: 'processing' as const,
    }
    const timedOutBoard = {
      ...sampleIntent,
      kind: 'board' as const,
      onchainOutpoints: [{ txid: 'aa', vout: 1 }],
      lifecyclePhase: 'timed_out' as const,
      registeredAt: 1,
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
    expect(pendingIntentAllowsRetry(timedOutBoard, 1 + BOARDING_REGISTER_INTENT_TTL_SECS)).toBe(
      true,
    )
    expect(pendingIntentAllowsCancel(processingRecover)).toBe(true)
    expect(pendingIntentAllowsRetry(processingRecover)).toBe(true)
  })

  it('is_boarding_only_requires_onchain_outpoints', () => {
    expect(isBoardingOnlyPendingIntent(sampleIntent)).toBe(false)
    expect(
      isBoardingOnlyPendingIntent({
        ...sampleIntent,
        onchainOutpoints: [{ txid: 'aa', vout: 1 }],
      }),
    ).toBe(true)
    expect(
      isBoardingOnlyPendingIntent({
        ...sampleIntent,
        kind: 'recover',
        onchainOutpoints: [{ txid: 'aa', vout: 1 }],
      }),
    ).toBe(true)
  })

  it('pending_intent_allows_retry_refuses_boarding_within_ttl', () => {
    const recentBoard = {
      ...sampleIntent,
      intentId: 'intent-1',
      onchainOutpoints: [{ txid: 'aa', vout: 1 }],
      lifecyclePhase: 'timed_out' as const,
      registeredAt: 1_000,
    }
    expect(
      pendingIntentAllowsRetry(recentBoard, 1_000 + BOARDING_REGISTER_INTENT_TTL_SECS - 1),
    ).toBe(false)
  })

  it('pending_intent_allows_retry_allows_boarding_after_ttl', () => {
    const expiredBoard = {
      ...sampleIntent,
      intentId: 'intent-1',
      onchainOutpoints: [{ txid: 'aa', vout: 1 }],
      lifecyclePhase: 'timed_out' as const,
      registeredAt: 1_000,
    }
    expect(
      pendingIntentAllowsRetry(expiredBoard, 1_000 + BOARDING_REGISTER_INTENT_TTL_SECS),
    ).toBe(true)
  })

  it('pending_batch_intent_timed_out_message_is_distinct', () => {
    expect(pendingBatchIntentTimedOutMessage('board')).toContain('timed out')
    expect(pendingBatchIntentTimedOutMessage('board')).not.toBe(
      pendingBatchIntentWaitingMessage('board'),
    )
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
