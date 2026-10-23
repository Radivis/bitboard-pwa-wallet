export const BARK_SESSION_LOADING_SPIN_DURATION_CLASS = '[animation-duration:2s]'

export const BARK_SESSION_LOAD_ERROR_TILT_CLASS = 'rotate-[160deg]'

const BARK_SESSION_STATUS_EMBEDDED_CLASS_NAME =
  'flex flex-col items-center justify-center gap-4 px-2 py-4 text-center'

const BARK_SESSION_STATUS_PAGE_CLASS_NAME =
  'flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center'

export function barkSessionStatusClassName(embedded: boolean): string {
  return embedded
    ? BARK_SESSION_STATUS_EMBEDDED_CLASS_NAME
    : BARK_SESSION_STATUS_PAGE_CLASS_NAME
}
