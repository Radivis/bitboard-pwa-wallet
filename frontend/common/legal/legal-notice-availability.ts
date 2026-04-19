import { LEGAL_NOTICE_DE_HAS_CONTENT } from './LegalNoticeDe'
import { LEGAL_NOTICE_EN_HAS_CONTENT } from './LegalNoticeEn'

/**
 * Legal notice is shown only when both locales have imprint content (`LegalNoticeDe` /
 * `LegalNoticeEn`). No partial locales or fallbacks — the active language always comes from
 * `useLegalLocale()` once this returns true.
 */
export function shouldShowLegalNotice(): boolean {
  return LEGAL_NOTICE_DE_HAS_CONTENT && LEGAL_NOTICE_EN_HAS_CONTENT
}
