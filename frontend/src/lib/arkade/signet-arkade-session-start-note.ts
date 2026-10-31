import type { NetworkMode } from '@/stores/walletStore'

export const SIGNET_ARKADE_SESSION_START_APPENDIX =
  'Arkade infrastructure on Signet may be less reliable than on Mainnet or Mutinynet. You may want to proceed on either of those alternatives.'

/** Appends the Signet reliability note to a session-start failure. Other networks stay unchanged. */
export function appendSignetArkadeSessionStartNote(
  message: string,
  networkMode: NetworkMode | null,
): string {
  if (networkMode !== 'signet') return message
  const trimmedMessage = message.trim()
  if (trimmedMessage.includes(SIGNET_ARKADE_SESSION_START_APPENDIX)) return trimmedMessage
  if (trimmedMessage === '') return SIGNET_ARKADE_SESSION_START_APPENDIX
  return `${trimmedMessage}: ${SIGNET_ARKADE_SESSION_START_APPENDIX}`
}
