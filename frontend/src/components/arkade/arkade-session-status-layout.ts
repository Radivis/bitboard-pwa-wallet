export const ARKADE_SESSION_LOADING_SPIN_DURATION_CLASS = '[animation-duration:2s]'

export const ARKADE_SESSION_LOAD_ERROR_TILT_CLASS = 'rotate-[160deg]'

const ARKADE_SESSION_STATUS_EMBEDDED_CLASS_NAME =
  'flex flex-col items-center justify-center gap-4 px-2 py-4 text-center'

const ARKADE_SESSION_STATUS_PAGE_CLASS_NAME =
  'flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center'

export function arkadeSessionStatusClassName(embedded: boolean): string {
  return embedded
    ? ARKADE_SESSION_STATUS_EMBEDDED_CLASS_NAME
    : ARKADE_SESSION_STATUS_PAGE_CLASS_NAME
}
