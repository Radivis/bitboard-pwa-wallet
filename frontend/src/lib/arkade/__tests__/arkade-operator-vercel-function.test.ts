import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from '../../../../api/arkade/operator/[...path]'

type RecordedResponse = {
  statusCode: number | null
  body: unknown
}

function operatorProxyRequest(pathname: string): VercelRequest {
  return {
    url: pathname,
    method: 'GET',
    headers: { host: 'bitboard.example' },
  } as unknown as VercelRequest
}

function recordingResponse(): { response: VercelResponse; recorded: RecordedResponse } {
  const recorded: RecordedResponse = { statusCode: null, body: undefined }
  const response = {
    setHeader: () => response,
    status: (statusCode: number) => {
      recorded.statusCode = statusCode
      return response
    },
    send: (body: unknown) => {
      recorded.body = body
      return response
    },
    end: () => response,
  }
  return { response: response as unknown as VercelResponse, recorded }
}

describe('Arkade operator Vercel function', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'ARK-PROXY-01 answers 404 for the inherited key %s and makes no upstream request',
    async (networkSegment) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const { response, recorded } = recordingResponse()

      await handler(
        operatorProxyRequest(`/api/arkade/operator/${networkSegment}/v1/info`),
        response,
      )

      expect(recorded.statusCode).toBe(404)
      expect(recorded.body).toBe('Unknown network')
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )
})
