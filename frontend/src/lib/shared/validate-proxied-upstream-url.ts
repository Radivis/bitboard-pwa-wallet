/**
 * Path segments that must not appear in edge proxy tail paths (`..` escapes the allowlisted base on resolution).
 */
export function hasUnsafePathSegment(segments: string[]): boolean {
  return segments.some((s) => s === '.' || s === '..')
}

/**
 * Verifies the fully resolved upstream URL stays under the allowlisted base path on the same origin.
 * Use after concatenating `allowlistedBaseTrimmed` + client subpath + search.
 */
export function isProxiedUrlPathWithinAllowlistedBase(
  upstreamUrl: string,
  allowlistedBaseTrimmed: string,
): boolean {
  let resolved: URL
  let base: URL
  try {
    resolved = new URL(upstreamUrl)
    base = new URL(allowlistedBaseTrimmed)
  } catch {
    return false
  }
  if (resolved.origin !== base.origin) return false

  const basePath = base.pathname.replace(/\/$/, '') || '/'
  const resPath = resolved.pathname

  if (basePath === '/') {
    // Faucet entries that map to the site root: only the origin is fixed; any same-origin path is allowed.
    return true
  }

  if (resPath === basePath) return true
  return resPath.startsWith(`${basePath}/`)
}
