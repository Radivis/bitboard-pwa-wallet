import {
  isValidAmount,
  isUrl,
  parseLnUrlPayResponse,
} from '@getalby/lightning-tools/lnurl'
import { decodeLnurlBech32ToUrl } from '@/lib/lightning/decode-lnurl-bech32'
import {
  LnurlFetchError,
  LnurlUnsupportedTagError,
} from '@/lib/lightning/lnurl-pay-errors'
import {
  isLnurlBech32String,
  isLnurlpSchemeUrl,
  normalizeLnurlpSchemeToHttps,
} from '@/lib/lightning/lightning-utils'

const PAY_REQUEST_TAG = 'payRequest'

type LnurlEndpointJson = {
  tag?: string
  callback?: string
  minSendable?: number
  maxSendable?: number
  metadata?: string
}

export type ResolvedLnurlPayInvoice = {
  bolt11: string
  verifyUrl?: string
}

function resolveLnurlPayHttpsUrl(recipient: string): string {
  const trimmed = recipient.trim()
  if (isLnurlpSchemeUrl(trimmed)) {
    return normalizeLnurlpSchemeToHttps(trimmed)
  }
  if (isLnurlBech32String(trimmed)) {
    return decodeLnurlBech32ToUrl(trimmed)
  }
  throw new Error('Not an LNURL pay destination')
}

async function fetchLnurlJson(url: string): Promise<LnurlEndpointJson> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new LnurlFetchError()
    }
    return (await response.json()) as LnurlEndpointJson
  } catch (error) {
    if (error instanceof LnurlUnsupportedTagError || error instanceof LnurlFetchError) {
      throw error
    }
    throw new LnurlFetchError()
  }
}

function assertHttpsLnurlUrl(url: string): void {
  if (!url.startsWith('https://')) {
    throw new Error('LNURL pay links must use HTTPS')
  }
}

function assertSupportedLnurlTag(tag: string | undefined): void {
  if (tag == null || tag === PAY_REQUEST_TAG) {
    return
  }
  throw new LnurlUnsupportedTagError(tag)
}

function formatAmountRangeError(minMsats: number, maxMsats: number): string {
  const minSats = Math.ceil(minMsats / 1000)
  const maxSats = Math.floor(maxMsats / 1000)
  return `Amount must be between ${minSats} and ${maxSats} sats`
}

function applyLnurlCallbackQueryParams(callbackUrl: URL, params: {
  amountMsats: number
  metadataHash: string
}): void {
  callbackUrl.searchParams.set('amount', params.amountMsats.toString())
  if (params.metadataHash.trim() !== '') {
    callbackUrl.searchParams.set('metadataHash', params.metadataHash)
  }
}

export async function resolveLnurlPayInvoice({
  recipient,
  amountSats,
}: {
  recipient: string
  amountSats: number
}): Promise<ResolvedLnurlPayInvoice> {
  const httpsUrl = resolveLnurlPayHttpsUrl(recipient)
  assertHttpsLnurlUrl(httpsUrl)

  const endpointJson = await fetchLnurlJson(httpsUrl)
  assertSupportedLnurlTag(endpointJson.tag)

  const lnurlpData = await parseLnUrlPayResponse({
    tag: PAY_REQUEST_TAG,
    callback: endpointJson.callback ?? '',
    minSendable: endpointJson.minSendable ?? 0,
    maxSendable: endpointJson.maxSendable ?? 0,
    metadata: endpointJson.metadata ?? '[]',
  })

  const amountMsats = amountSats * 1000
  if (
    !isValidAmount({
      amount: amountMsats,
      min: lnurlpData.min,
      max: lnurlpData.max,
    })
  ) {
    throw new Error(formatAmountRangeError(lnurlpData.min, lnurlpData.max))
  }

  if (!lnurlpData.callback || !isUrl(lnurlpData.callback)) {
    throw new Error('Invalid LNURL pay callback')
  }

  const callbackUrl = new URL(lnurlpData.callback)
  applyLnurlCallbackQueryParams(callbackUrl, {
    amountMsats,
    metadataHash: lnurlpData.metadataHash,
  })

  let invoiceJson: { pr?: string; verify?: string }
  try {
    const invoiceResponse = await fetch(callbackUrl.toString())
    if (!invoiceResponse.ok) {
      throw new LnurlFetchError()
    }
    invoiceJson = (await invoiceResponse.json()) as { pr?: string; verify?: string }
  } catch (error) {
    if (error instanceof LnurlFetchError) {
      throw error
    }
    throw new LnurlFetchError()
  }

  const bolt11 = invoiceJson.pr?.toString()
  if (!bolt11) {
    throw new Error('Invalid pay service invoice')
  }

  return {
    bolt11,
    verifyUrl: invoiceJson.verify?.toString(),
  }
}
