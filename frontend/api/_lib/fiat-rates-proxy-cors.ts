/**
 * CORS allowlist for `/api/fiat-rates` — kept under `api/_lib` so the serverless bundle does not
 * depend on `src/` (see handler file header: importing `src/` modules broke this proxy before).
 */
export const FIAT_RATES_PROXY_CORS_ALLOWED_ORIGINS_EXACT = [
  'https://bitboard-wallet.com',
  'https://app.bitboard-wallet.com',
] as const

/**
 * Vercel preview deployments: `https://bitboard-pwa-wallet-{id}-radivis-projects.vercel.app`
 */
const FIAT_RATES_PROXY_CORS_PREVIEW_ORIGIN_RE =
  /^https:\/\/bitboard-pwa-wallet-[a-z0-9]+-radivis-projects\.vercel\.app$/i

export function fiatRatesProxyCorsAllowedOrigin(
  originHeader: string | string[] | undefined,
): string | null {
  const raw =
    typeof originHeader === 'string'
      ? originHeader
      : Array.isArray(originHeader)
        ? originHeader[0]
        : undefined
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (
    (FIAT_RATES_PROXY_CORS_ALLOWED_ORIGINS_EXACT as readonly string[]).includes(
      raw,
    )
  ) {
    return raw
  }
  if (FIAT_RATES_PROXY_CORS_PREVIEW_ORIGIN_RE.test(raw)) return raw
  return null
}
