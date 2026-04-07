import { create } from 'zustand'

/**
 * When the user locks from a wallet route, we redirect to the Library. This store
 * remembers the wallet path so we can explain the redirect and offer “return after unlock”.
 */
interface PostLockPrivacyRedirectState {
  privacyRedirect: { returnPath: string } | null
  setPrivacyRedirectFromLock: (returnPath: string) => void
  dismissPrivacyRedirectBanner: () => void
}

export const usePostLockPrivacyRedirectStore =
  create<PostLockPrivacyRedirectState>((set) => ({
    privacyRedirect: null,
    setPrivacyRedirectFromLock: (returnPath) => {
      if (!returnPath.startsWith('/wallet')) return
      set({ privacyRedirect: { returnPath } })
    },
    dismissPrivacyRedirectBanner: () => set({ privacyRedirect: null }),
  }))
