/** `{ receiveCount }` from `bark_receive_payment_count`, as JSON or an object. */
export function readBarkReceivePaymentCount(value: unknown): number {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      throw new Error('Bark receive payment count was not JSON')
    }
  }
  if (parsed == null || typeof parsed !== 'object') {
    throw new Error('Bark receive payment count was not an object')
  }
  const row = parsed as Record<string, unknown>
  const receiveCount =
    typeof row.receiveCount === 'bigint' || typeof row.receiveCount === 'number'
      ? Number(row.receiveCount)
      : Number.NaN
  if (!Number.isSafeInteger(receiveCount) || receiveCount < 0) {
    throw new Error('Bark receive payment count was not a count')
  }
  return receiveCount
}
