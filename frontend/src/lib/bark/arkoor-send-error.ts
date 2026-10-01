import { errorMessage } from '@/lib/shared/utils'

export function barkArkoorSendErrorMessage(err: unknown): string {
  const message = errorMessage(err)
  switch (message) {
    case 'not_synced':
      return 'Sync Bark before sending.'
    case 'arkade_address':
      return 'Arkade addresses are not Bark destinations.'
    case 'invalid_address':
      return 'That is not a Bark Ark address.'
    case 'network_mismatch':
      return 'That Bark address is for a different network.'
    case 'server_mismatch':
      return 'That Bark address is for a different server.'
    case 'policy_not_supported':
      return 'That Bark address cannot receive an Arkoor payment.'
    case 'unknown_delivery':
      return 'That Bark address uses an unsupported delivery method.'
    default:
      return message
  }
}
