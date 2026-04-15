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
  [
    'aboutSectionBackgroundImageUrl',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800&h=800',
  ],
]);

export function landingPageLink(key: string): string {
  return LANDING_PAGE_LINKS.get(key) ?? '';
}
