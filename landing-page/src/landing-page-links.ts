import { GITHUB_CHANGELOG_URL, GITHUB_REPOSITORY_URL } from '@common/public-links'

/**
 * Outbound URLs for the landing page (single source of truth).
 *
 * Production: marketing at bitboard-wallet.com, PWA at app.bitboard-wallet.com.
 * `blog` and `website` are empty until those surfaces go live.
 */
export const LANDING_PAGE_LINKS = new Map<string, string>([
  ['githubRepository', GITHUB_REPOSITORY_URL],
  ['changelog', GITHUB_CHANGELOG_URL],
  ['app', 'https://app.bitboard-wallet.com'],
  ['blog', ''],
  ['website', ''],
]);

export function landingPageLink(key: string): string {
  return LANDING_PAGE_LINKS.get(key) ?? '';
}
