export interface LnbitsWalletInfo {
  id: string
  name: string
  balance: number
}

export interface LnbitsInvoiceResponse {
  payment_hash: string
  payment_request: string
}

export interface LnbitsPaymentResponse {
  payment_hash: string
}

export interface LnbitsPayment {
  payment_hash: string
  pending: boolean
  amount: number
  memo: string
  time: number
  bolt11: string
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `LNBits API error (${response.status}): ${body || response.statusText}`,
    )
  }
  return response.json() as Promise<T>
}

export class LnbitsClient {
  private readonly baseUrl: string
  private readonly adminApiKey: string

  constructor(baseUrl: string, adminApiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.adminApiKey = adminApiKey
  }

  private headers(): HeadersInit {
    return {
      'X-Api-Key': this.adminApiKey,
      'Content-Type': 'application/json',
    }
  }

  async getWalletInfo(): Promise<LnbitsWalletInfo> {
    const response = await fetch(`${this.baseUrl}/api/v1/wallet`, {
      headers: this.headers(),
    })
    return handleResponse<LnbitsWalletInfo>(response)
  }

  async createInvoice(params: {
    amountSats: number
    memo?: string
    expiry?: number
  }): Promise<LnbitsInvoiceResponse> {
    const body: Record<string, unknown> = {
      out: false,
      amount: params.amountSats,
    }
    if (params.memo) body.memo = params.memo
    if (params.expiry) body.expiry = params.expiry

    const response = await fetch(`${this.baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    return handleResponse<LnbitsInvoiceResponse>(response)
  }

  async payInvoice(bolt11: string): Promise<LnbitsPaymentResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ out: true, bolt11 }),
    })
    return handleResponse<LnbitsPaymentResponse>(response)
  }

  async listPayments(): Promise<LnbitsPayment[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/payments`, {
      headers: this.headers(),
    })
    return handleResponse<LnbitsPayment[]>(response)
  }

  async checkPaymentStatus(paymentHash: string): Promise<LnbitsPayment> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/payments/${paymentHash}`,
      { headers: this.headers() },
    )
    return handleResponse<LnbitsPayment>(response)
  }
}
