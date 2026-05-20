import type { NetworkMode } from '@/stores/walletStore'

export const WALLET_DASHBOARD_TITLE = 'Dashboard' as const
export const LAB_WALLET_DASHBOARD_TITLE = 'Lab Wallet Dashboard' as const

export const WALLET_BALANCE_CARD_TITLE = 'Balance' as const
export const LAB_WALLET_BALANCE_CARD_TITLE = 'Lab Balance' as const

export const LAB_WALLET_BALANCE_DISCLAIMER =
  'Balance does not represent real bitcoin, but balance on the simulated Lab blockchain only living on this device. Change network mode in settings, if you want to see your online balances.' as const

export const WALLET_ON_CHAIN_SECTION_LABEL = 'On-chain' as const
export const LAB_WALLET_ON_CHAIN_SECTION_LABEL = 'Simulated Lab blockchain' as const

export const WALLET_SEND_PAGE_TITLE = 'Send Bitcoin' as const
export const LAB_WALLET_SEND_PAGE_TITLE = 'Send Lab Bitcoin' as const

export const WALLET_RECEIVE_PAGE_TITLE = 'Receive Bitcoin' as const
export const LAB_WALLET_RECEIVE_PAGE_TITLE = 'Receive Lab Bitcoin' as const

export function walletDashboardTitle(networkMode: NetworkMode): string {
  return networkMode === 'lab' ? LAB_WALLET_DASHBOARD_TITLE : WALLET_DASHBOARD_TITLE
}

export function walletBalanceCardTitle(networkMode: NetworkMode): string {
  return networkMode === 'lab' ? LAB_WALLET_BALANCE_CARD_TITLE : WALLET_BALANCE_CARD_TITLE
}

export function walletOnChainSectionLabel(networkMode: NetworkMode): string {
  return networkMode === 'lab'
    ? LAB_WALLET_ON_CHAIN_SECTION_LABEL
    : WALLET_ON_CHAIN_SECTION_LABEL
}

export function walletSendPageTitle(networkMode: NetworkMode): string {
  return networkMode === 'lab' ? LAB_WALLET_SEND_PAGE_TITLE : WALLET_SEND_PAGE_TITLE
}

export function walletReceivePageTitle(networkMode: NetworkMode): string {
  return networkMode === 'lab' ? LAB_WALLET_RECEIVE_PAGE_TITLE : WALLET_RECEIVE_PAGE_TITLE
}
