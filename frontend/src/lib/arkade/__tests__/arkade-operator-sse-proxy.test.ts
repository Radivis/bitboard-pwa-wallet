import { describe, expect, it } from 'vitest'
import {
  isOperatorServerSentEventsRequest,
  OPERATOR_SSE_SUBSCRIPTION_PATH_PREFIX,
  OPERATOR_SSE_UPSTREAM_PATHS,
} from '@/lib/arkade/arkade-operator-sse-proxy'

describe('isOperatorServerSentEventsRequest', () => {
  const eventStreamAccept = 'text/event-stream'

  it.each(OPERATOR_SSE_UPSTREAM_PATHS)(
    'returns true for GET %s with event-stream Accept',
    (ssePath) => {
      expect(
        isOperatorServerSentEventsRequest('GET', ssePath, eventStreamAccept),
      ).toBe(true)
      expect(
        isOperatorServerSentEventsRequest(
          'get',
          `/${ssePath}`,
          'application/json, text/event-stream;q=0.9',
        ),
      ).toBe(true)
    },
  )

  it('returns true for script subscription SSE path', () => {
    expect(
      isOperatorServerSentEventsRequest(
        'GET',
        `${OPERATOR_SSE_SUBSCRIPTION_PATH_PREFIX}e2e-sub-id`,
        eventStreamAccept,
      ),
    ).toBe(true)
  })

  it('returns false without text/event-stream Accept', () => {
    expect(
      isOperatorServerSentEventsRequest(
        'GET',
        'v1/batch/events',
        'application/json',
      ),
    ).toBe(false)
    expect(
      isOperatorServerSentEventsRequest('GET', 'v1/batch/events', undefined),
    ).toBe(false)
  })

  it('returns false for non-GET methods on SSE paths', () => {
    expect(
      isOperatorServerSentEventsRequest(
        'POST',
        'v1/batch/events',
        eventStreamAccept,
      ),
    ).toBe(false)
    expect(
      isOperatorServerSentEventsRequest(
        'HEAD',
        'v1/batch/events',
        eventStreamAccept,
      ),
    ).toBe(false)
  })

  it('returns false for unary operator paths even with event-stream Accept', () => {
    expect(
      isOperatorServerSentEventsRequest(
        'GET',
        'v1/info',
        eventStreamAccept,
      ),
    ).toBe(false)
    expect(
      isOperatorServerSentEventsRequest(
        'GET',
        'v1/indexer/vtxos',
        eventStreamAccept,
      ),
    ).toBe(false)
    expect(
      isOperatorServerSentEventsRequest(
        'POST',
        'v1/indexer/script/subscribe',
        eventStreamAccept,
      ),
    ).toBe(false)
  })
})
