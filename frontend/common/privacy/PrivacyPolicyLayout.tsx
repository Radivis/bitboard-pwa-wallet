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
