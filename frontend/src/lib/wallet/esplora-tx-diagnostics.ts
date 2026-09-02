import {
  formatEsploraTxStatusForDiagnostic,
  parseEsploraTxStatusFromTxEndpointBody,
  type EsploraTxStatusSnapshot,
} from '@/lib/wallet/esplora-tx-anchor-metadata'

export type EsploraHttpProbe = {
  httpStatus: number | null
  available: boolean
  error?: string
}

export type EsploraTxDiagnosticReport = {
  txid: string
  statusEndpoint: EsploraHttpProbe & { status: EsploraTxStatusSnapshot | null }
  rawEndpoint: EsploraHttpProbe
  merkleProofEndpoint: EsploraHttpProbe & { blockHeight: number | null }
  txJsonEndpoint: EsploraHttpProbe & { status: EsploraTxStatusSnapshot | null }
  inferredConfirmations: number
}

function normalizeEsploraApiBase(esploraApiBase: string): string {
  return esploraApiBase.replace(/\/$/, '')
}

async function probeJson(
  url: string,
): Promise<{ httpStatus: number; body: unknown } | { httpStatus: null; error: string }> {
  try {
    const response = await fetch(url)
    const text = await response.text()
    if (!response.ok) {
      return { httpStatus: response.status, body: text }
    }
    try {
      return { httpStatus: response.status, body: JSON.parse(text) as unknown }
    } catch {
      return { httpStatus: response.status, body: text }
    }
  } catch (error) {
    return {
      httpStatus: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function probeRaw(url: string): Promise<EsploraHttpProbe> {
  try {
    const response = await fetch(url)
    return {
      httpStatus: response.status,
      available: response.ok,
      error: response.ok ? undefined : (await response.text()).slice(0, 200),
    }
  } catch (error) {
    return {
      httpStatus: null,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function confirmationsFromStatus(
  status: EsploraTxStatusSnapshot | null,
  chainTipHeight: number | null,
): number {
  if (status == null || !status.confirmed) {
    return 0
  }
  if (status.blockHeight != null && chainTipHeight != null) {
    return Math.max(0, chainTipHeight - status.blockHeight + 1)
  }
  return 1
}

export async function fetchEsploraChainTipHeight(
  esploraApiBase: string,
): Promise<number | null> {
  const base = normalizeEsploraApiBase(esploraApiBase)
  const probe = await probeJson(`${base}/blocks/tip/height`)
  if (probe.httpStatus == null || probe.httpStatus !== 200) {
    return null
  }
  if (typeof probe.body === 'number') {
    return probe.body
  }
  if (typeof probe.body === 'string' && /^\d+$/.test(probe.body.trim())) {
    return Number.parseInt(probe.body.trim(), 10)
  }
  return null
}

/**
 * Probe the Esplora endpoints the wallet uses for unilateral-exit step confirmation.
 * Safe to call for virtual-tree txids that are not yet on chain (missing => 0 confirmations).
 */
export async function fetchEsploraTxDiagnosticReport(
  esploraApiBase: string,
  txid: string,
  chainTipHeight: number | null = null,
): Promise<EsploraTxDiagnosticReport> {
  const base = normalizeEsploraApiBase(esploraApiBase)
  const tipHeight = chainTipHeight ?? (await fetchEsploraChainTipHeight(base))

  const statusProbe = await probeJson(`${base}/tx/${txid}/status`)
  const statusSnapshot =
    statusProbe.httpStatus === 200
      ? parseEsploraTxStatusFromTxEndpointBody(txid, { status: statusProbe.body })
      : null

  const rawEndpoint = await probeRaw(`${base}/tx/${txid}/raw`)

  const merkleProbe = await probeJson(`${base}/tx/${txid}/merkle-proof`)
  const merkleBlockHeight =
    merkleProbe.httpStatus === 200 &&
    merkleProbe.body != null &&
    typeof merkleProbe.body === 'object' &&
    'block_height' in merkleProbe.body &&
    typeof (merkleProbe.body as { block_height?: unknown }).block_height === 'number'
      ? (merkleProbe.body as { block_height: number }).block_height
      : null

  const txJsonProbe = await probeJson(`${base}/tx/${txid}`)
  const txJsonStatus =
    txJsonProbe.httpStatus === 200
      ? parseEsploraTxStatusFromTxEndpointBody(txid, txJsonProbe.body)
      : null

  let inferredConfirmations = 0
  if (merkleBlockHeight != null && tipHeight != null) {
    inferredConfirmations = Math.max(0, tipHeight - merkleBlockHeight + 1)
  } else {
    inferredConfirmations = Math.max(
      confirmationsFromStatus(statusSnapshot, tipHeight),
      confirmationsFromStatus(txJsonStatus, tipHeight),
    )
  }

  return {
    txid,
    statusEndpoint: {
      httpStatus: statusProbe.httpStatus,
      available: statusProbe.httpStatus === 200,
      error:
        statusProbe.httpStatus != null && statusProbe.httpStatus !== 200
          ? String(statusProbe.body).slice(0, 200)
          : statusProbe.httpStatus == null
            ? statusProbe.error
            : undefined,
      status: statusSnapshot,
    },
    rawEndpoint,
    merkleProofEndpoint: {
      httpStatus: merkleProbe.httpStatus,
      available: merkleProbe.httpStatus === 200,
      error:
        merkleProbe.httpStatus != null && merkleProbe.httpStatus !== 200
          ? String(merkleProbe.body).slice(0, 200)
          : merkleProbe.httpStatus == null
            ? merkleProbe.error
            : undefined,
      blockHeight: merkleBlockHeight,
    },
    txJsonEndpoint: {
      httpStatus: txJsonProbe.httpStatus,
      available: txJsonProbe.httpStatus === 200,
      error:
        txJsonProbe.httpStatus != null && txJsonProbe.httpStatus !== 200
          ? String(txJsonProbe.body).slice(0, 200)
          : txJsonProbe.httpStatus == null
            ? txJsonProbe.error
            : undefined,
      status: txJsonStatus,
    },
    inferredConfirmations,
  }
}

export function formatEsploraTxDiagnosticReport(report: EsploraTxDiagnosticReport): string {
  const lines = [`txid ${report.txid}`, `inferred_confirmations=${report.inferredConfirmations}`]

  if (report.statusEndpoint.status != null) {
    lines.push(`/status: ${formatEsploraTxStatusForDiagnostic(report.statusEndpoint.status)}`)
  } else {
    lines.push(
      `/status: http=${report.statusEndpoint.httpStatus ?? 'error'} ${report.statusEndpoint.error ?? ''}`.trim(),
    )
  }

  lines.push(
    `/raw: http=${report.rawEndpoint.httpStatus ?? 'error'} available=${report.rawEndpoint.available}`,
  )

  if (report.merkleProofEndpoint.blockHeight != null) {
    lines.push(`/merkle-proof: block_height=${report.merkleProofEndpoint.blockHeight}`)
  } else {
    lines.push(
      `/merkle-proof: http=${report.merkleProofEndpoint.httpStatus ?? 'error'} ${report.merkleProofEndpoint.error ?? 'missing'}`.trim(),
    )
  }

  if (report.txJsonEndpoint.status != null) {
    lines.push(`/tx JSON: ${formatEsploraTxStatusForDiagnostic(report.txJsonEndpoint.status)}`)
  } else {
    lines.push(
      `/tx JSON: http=${report.txJsonEndpoint.httpStatus ?? 'error'} ${report.txJsonEndpoint.error ?? ''}`.trim(),
    )
  }

  return lines.join('\n')
}
