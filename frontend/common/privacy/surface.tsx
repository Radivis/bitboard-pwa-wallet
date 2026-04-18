import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'

export type PrivacyPolicySurface = 'landing' | 'app'

const PrivacyPolicySurfaceContext = createContext<PrivacyPolicySurface>('app')

export function PrivacyPolicySurfaceProvider({
  surface,
  children,
}: {
  surface: PrivacyPolicySurface
  children: ReactNode
}) {
  return (
    <PrivacyPolicySurfaceContext.Provider value={surface}>
      {children}
    </PrivacyPolicySurfaceContext.Provider>
  )
}

export function usePrivacyPolicySurface(): PrivacyPolicySurface {
  return useContext(PrivacyPolicySurfaceContext)
}

/** Typography wrapper for shared privacy policy body (landing vs app theme). */
export function privacyPolicyArticleClassName(surface: PrivacyPolicySurface): string {
  const base = 'space-y-6 max-w-3xl text-sm leading-relaxed'
  if (surface === 'landing') {
    return [
      'space-y-6 max-w-3xl text-base leading-relaxed text-gray-300',
      '[&_h1]:text-4xl [&_h1]:sm:text-5xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-white [&_h1]:mb-8 [&_h1]:leading-tight',
      '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:sm:text-3xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-gray-100',
      '[&_p]:mb-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1',
      '[&_a]:text-emerald-400 [&_a]:underline [&_a]:hover:text-emerald-300',
      '[&_strong]:font-semibold [&_strong]:text-gray-200',
    ].join(' ')
  }
  return [
    base,
    'text-muted-foreground',
    '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mb-4',
    '[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground',
    '[&_p]:mb-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1',
    '[&_a]:text-primary [&_a]:underline',
    '[&_strong]:font-semibold [&_strong]:text-foreground',
  ].join(' ')
}
