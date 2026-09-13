import { describe, expect, it } from 'vitest'
import {
  buildListVtxosResponse,
  buildMockVtxosForScripts,
  parseScriptsFromRequestUrl,
} from '@/lib/arkade/e2e/arkade-operator-mock-handler'
import {
  E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS,
  E2E_ARKADE_MOCK_INCOMING_TXID,
  E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS,
  E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID,
  getE2eArkadeOperatorMockState,
  resetE2eArkadeOperatorMockState,
} from '@/lib/arkade/e2e/arkade-operator-mock-state'

const PARTITION = 'mock-handler-unit-test'

describe('arkade operator mock vtxo builder', () => {
  it('parseScriptsFromRequestUrl reads repeated scripts query params', () => {
    const scripts = parseScriptsFromRequestUrl(
      'http://localhost/api/arkade/operator/signet/v1/indexer/vtxos?scripts=5120abc&scripts=5120def',
    )
    expect(scripts).toEqual(['5120abc', '5120def'])
  })

  it('parseScriptsFromRequestUrl still accepts legacy comma-separated scripts value', () => {
    const scripts = parseScriptsFromRequestUrl(
      'http://localhost/v1/indexer/vtxos?scripts=5120abc,5120def',
    )
    expect(scripts).toEqual(['5120abc', '5120def'])
  })

  it('E2E-ARK-MOCK-04 funds the default fixture on the first script', () => {
    resetE2eArkadeOperatorMockState(PARTITION)
    const mockState = getE2eArkadeOperatorMockState(PARTITION)

    const vtxos = buildMockVtxosForScripts(mockState, ['script_a'])

    expect(vtxos).toHaveLength(1)
    expect(vtxos[0].amount).toBe(String(E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS))
    expect(vtxos[0].commitmentTxids).toEqual([expect.any(String)])
    expect(vtxos[0].commitmentTxids[0]).toHaveLength(64)
  })

  it('E2E-ARK-MOCK-04 applies a pending incoming payment to the next unfunded script', () => {
    resetE2eArkadeOperatorMockState(PARTITION)
    const mockState = getE2eArkadeOperatorMockState(PARTITION)

    buildMockVtxosForScripts(mockState, ['script_a'])
    mockState.pendingIncomingPayment = {
      txid: E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID,
      amountSats: E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS,
      timestamp: 1_700_000_100,
    }

    const vtxos = buildMockVtxosForScripts(mockState, ['script_a', 'script_b'])

    expect(vtxos).toHaveLength(2)
    expect(vtxos[0].arkTxid).toBe(E2E_ARKADE_MOCK_INCOMING_TXID)
    expect(vtxos[0].amount).toBe(String(E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS))
    expect(vtxos[1].arkTxid).toBe(E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID)
    expect(vtxos[1].amount).toBe(String(E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS))
    expect(mockState.pendingIncomingPayment).toBeNull()
  })

  it('does not treat scripts[0] on later discovery batches as the default fixture', () => {
    resetE2eArkadeOperatorMockState(PARTITION)
    const mockState = getE2eArkadeOperatorMockState(PARTITION)

    buildMockVtxosForScripts(mockState, ['script_a'])

    const laterBatchVtxos = buildMockVtxosForScripts(mockState, ['script_z'])
    expect(laterBatchVtxos).toHaveLength(0)
    expect(mockState.paymentsByScript.has('script_z')).toBe(false)
  })

  it('listVtxos page cursor is a terminal 1-indexed arkd page so discovery does not loop', () => {
    resetE2eArkadeOperatorMockState(PARTITION)
    const mockState = getE2eArkadeOperatorMockState(PARTITION)
    const response = buildListVtxosResponse(
      mockState,
      'http://localhost/api/arkade/operator/signet/v1/indexer/vtxos?scripts=5120abc',
    )

    expect(response.vtxos).toHaveLength(1)
    // Mirrors ark_core::server::IndexerPage::next_page_index after the arkd pagination fix.
    const wouldRequestNextPage =
      response.page.current < response.page.total &&
      response.page.next > response.page.current
    expect(wouldRequestNextPage).toBe(false)
  })

  it('keeps an already-applied incoming payment on a later list (poll then rail-sync)', () => {
    resetE2eArkadeOperatorMockState(PARTITION)
    const mockState = getE2eArkadeOperatorMockState(PARTITION)

    buildMockVtxosForScripts(mockState, ['script_a'])
    mockState.pendingIncomingPayment = {
      txid: E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID,
      amountSats: E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS,
      timestamp: 1_700_000_100,
    }
    buildMockVtxosForScripts(mockState, ['script_a', 'script_b'])
    expect(mockState.pendingIncomingPayment).toBeNull()

    const vtxos = buildMockVtxosForScripts(mockState, ['script_a', 'script_b'])
    expect(vtxos).toHaveLength(2)
    expect(vtxos[0].amount).toBe(String(E2E_ARKADE_MOCK_DEFAULT_BALANCE_SATS))
    expect(vtxos[1].arkTxid).toBe(E2E_ARKADE_MOCK_RECEIVE_INCOMING_TXID)
    expect(vtxos[1].amount).toBe(String(E2E_ARKADE_MOCK_RECEIVE_INCOMING_SATS))
  })
})
