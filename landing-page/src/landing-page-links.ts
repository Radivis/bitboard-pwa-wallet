/**
 * Outbound URLs for the landing page (single source of truth).
 *
 * `app` and `blog` are intentionally empty strings — those sites are not live yet.
 * `website` is intentionally empty — the public marketing site is not ready yet.
 */
export const LANDING_PAGE_LINKS = new Map<string, string>([
  ['githubRepository', 'https://github.com/Radivis/bitboard-pwa-wallet'],
  ['app', ''],
  ['blog', ''],
  ['website', ''],
]);

export function landingPageLink(key: string): string {
  return LANDING_PAGE_LINKS.get(key) ?? '';
}
