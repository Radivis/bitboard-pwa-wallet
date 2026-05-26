/**
 * Edge proxy URL safety checks (path traversal + allowlisted-base containment).
 *
 * ## Why this file exists alongside duplicated copies in `frontend/api/`
 *
 * Vercel serverless handlers under `frontend/api/` **cannot import** from `src/` (or any path
 * outside `api/`). The bundler only packages the function directory; imports like
 * `import { … } from '../../src/lib/…'` fail at runtime with `FUNCTION_INVOCATION_FAILED`.
 * See `docs/vercel-api-functions.md` (§ “Imports from Outside `api/` Don't Work”).
 *
 * The same logic is therefore **inlined** (copy-pasted) into:
 * - `frontend/api/esplora/[...path].ts`
 * - `frontend/api/faucet/[...path].ts`
 *
 * This module is the **canonical, testable source of truth** for that logic in the app repo.
 * It is not dead code — `lib/shared/__tests__/validate-proxied-upstream-url.test.ts` exercises it.
 *
 * **When you change either function here, update the inlined copies in both API handlers** (and
 * their “Inlined from …” comments) so production proxies stay in sync with the tests.
 */

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
