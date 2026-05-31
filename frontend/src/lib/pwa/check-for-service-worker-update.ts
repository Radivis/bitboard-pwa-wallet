/**
 * Ask the browser to check whether a newer service worker is available.
 * Browsers also poll on their own schedule (often ~24h); calling this on focus
 * helps installed PWAs (e.g. Firefox desktop) discover updates sooner.
 */
export function checkForServiceWorkerUpdate(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  void navigator.serviceWorker.getRegistration().then((serviceWorkerRegistration) => {
    void serviceWorkerRegistration?.update()
  })
}
