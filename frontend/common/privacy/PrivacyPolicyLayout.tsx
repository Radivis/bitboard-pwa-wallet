/**
 * Layout wrapper for legal privacy policy pages. Policy text is in sibling `PrivacyPolicy*.tsx`
 * files; i18next may be introduced for shared UI strings later, not necessarily for these
 * long-form documents.
 */
import type { ReactNode } from 'react'
import {
  PrivacyPolicySurfaceProvider,
  privacyPolicyArticleClassName,
  type PrivacyPolicySurface,
} from './surface'

export function PrivacyPolicyLayout({
  surface,
  children,
}: {
  surface: PrivacyPolicySurface
  children: ReactNode
}) {
  return (
    <PrivacyPolicySurfaceProvider surface={surface}>
      <article className={privacyPolicyArticleClassName(surface)}>
        {children}
      </article>
    </PrivacyPolicySurfaceProvider>
  )
}
