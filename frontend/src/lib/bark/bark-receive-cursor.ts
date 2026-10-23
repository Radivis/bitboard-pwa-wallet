import { isBarkReceiveKeyIndex } from '@/lib/wallet/wallet-domain-types'

export type BarkReceiveCursorDecision =
  | { kind: 'keep'; receiveKeyIndex: number }
  | { kind: 'recover'; receiveKeyIndex: number }
  | { kind: 'reveal' }

/**
 * Unlock rule. A stored index is peeked. A key with no stored index is recovered.
 * Reveal only when Bark has neither.
 */
export function decideBarkReceiveCursorOnOpen(params: {
  storedReceiveKeyIndex: number | undefined
  lastRevealedKeyIndex: number | null
}): BarkReceiveCursorDecision {
  if (params.storedReceiveKeyIndex != null) {
    return { kind: 'keep', receiveKeyIndex: params.storedReceiveKeyIndex }
  }
  if (params.lastRevealedKeyIndex != null) {
    return { kind: 'recover', receiveKeyIndex: params.lastRevealedKeyIndex }
  }
  return { kind: 'reveal' }
}

/**
 * Resolves the index to persist on session open.
 * Does not read the last key or reveal when an index is already stored.
 */
export async function receiveKeyIndexForSessionOpen(params: {
  storedReceiveKeyIndex: number | undefined
  readLastRevealedKeyIndex: () => Promise<number | null>
  revealNextReceiveAddress: () => Promise<{ address: string; index: number }>
}): Promise<number> {
  const lastRevealedKeyIndex =
    params.storedReceiveKeyIndex == null ? await params.readLastRevealedKeyIndex() : null
  const decision = decideBarkReceiveCursorOnOpen({
    storedReceiveKeyIndex: params.storedReceiveKeyIndex,
    lastRevealedKeyIndex,
  })
  if (decision.kind === 'reveal') {
    const revealed = await params.revealNextReceiveAddress()
    return revealed.index
  }
  return decision.receiveKeyIndex
}

/** `null` or `undefined` means Bark has not stored a VTXO key yet. */
export function readBarkLastRevealedKeyIndex(value: unknown): number | null {
  if (value == null) return null
  if (!isBarkReceiveKeyIndex(value)) {
    throw new Error('Bark last revealed key index was not a number')
  }
  return value
}

export function readBarkRevealedReceiveAddress(value: {
  address?: unknown
  index?: unknown
  free?: () => void
}): { address: string; index: number } {
  try {
    if (typeof value.address !== 'string' || value.address.length === 0) {
      throw new Error('Bark reveal did not return an address')
    }
    if (!isBarkReceiveKeyIndex(value.index)) {
      throw new Error('Bark reveal did not return a key index')
    }
    return { address: value.address, index: value.index }
  } finally {
    value.free?.()
  }
}
