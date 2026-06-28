/** Stable Infomode zone ids for Arkade UI (kebab-case, arkade- prefix). */
export const ARKADE_INFOMODE_IDS = {
  dashboardBalance: 'arkade-dashboard-balance',
  operatorStale: 'arkade-operator-stale',
  balanceBoarding: 'arkade-balance-boarding',
  balanceVtxos: 'arkade-balance-vtxos',
  balanceExitProgress: 'arkade-balance-exit-progress',
  balanceRecoverable: 'arkade-balance-recoverable',
  managementPanel: 'arkade-management-panel',
  delegatorFee: 'arkade-delegator-fee',
  renewVtxos: 'arkade-renew-vtxos',
  vtxoExpiryIndicator: 'arkade-vtxo-expiry-indicator',
  boardFromOnchain: 'arkade-board-from-onchain',
  boardFlow: 'arkade-board-flow',
  learnAboutExits: 'arkade-learn-about-exits',
  boardingAddress: 'arkade-boarding-address',
  boardStatusReady: 'arkade-board-status-ready',
  boardStatusExpired: 'arkade-board-status-expired',
  receiveAddress: 'arkade-receive-address',
  sendPayment: 'arkade-send-payment',
  exitSection: 'arkade-exit-section',
  collaborativeExit: 'arkade-collaborative-exit',
  exitOperatorFees: 'arkade-exit-operator-fees',
  unilateralExit: 'arkade-unilateral-exit',
  bumperWallet: 'arkade-bumper-wallet',
  unroll: 'arkade-unroll',
  activityPayment: 'arkade-activity-payment',
  activityBoarding: 'arkade-activity-boarding',
  featureToggle: 'settings-feature-arkade',
} as const

export const ARKADE_LIBRARY_SLUGS = {
  overview: 'arkade-bitboard-wallet',
  vtxo: 'what-is-a-vtxo',
  boarding: 'boarding-to-arkade',
  vtxoExpiry: 'arkade-vtxo-expiry',
  exits: 'arkade-exits-explained',
  layer2: 'layer-2-networks',
} as const

export const ARKADE_OPERATOR_STALE_INFOMODE = {
  title: 'Saved Arkade state',
  text: 'These numbers come from your wallet\'s last saved operator session. Bitboard has not re-checked the operator live yet this session, so the balance may be slightly out of date until sync completes.',
} as const

export const ARKADE_BALANCE_BOARDING_INFOMODE = {
  title: 'On-chain boarding',
  text: 'Bitcoin you sent to your boarding address and that is confirmed on-chain, but not yet settled into Arkade. Tap "settle in management" or open Board from on-chain to turn it into spendable virtual balance units (VTXOs).',
} as const

export const ARKADE_BALANCE_BOARDING_PENDING_INFOMODE = {
  title: 'Pending boarding',
  text: 'A send to your boarding address is waiting for blockchain confirmation. Once confirmed, you can settle it into Arkade.',
} as const

export const ARKADE_BALANCE_VTXOS_INFOMODE = {
  title: 'Offchain VTXOs',
  text: 'The part of your Arkade balance already settled as virtual balance units (VTXOs)—ready for instant Arkade-to-Arkade payments.',
} as const

export const ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE = {
  title: 'Exit in progress',
  text: 'These sats are leaving Arkade back to on-chain Bitcoin. They are subtracted from what you can spend offchain until the exit finishes.',
} as const

export const ARKADE_BALANCE_RECOVERABLE_INFOMODE = {
  title: 'Recoverable total',
  text: 'Your full Arkade balance including funds in boarding, exits, or other states not counted in the spendable headline. Nothing is lost—you may need an extra step (settle, renew, or exit) to spend some of it.',
} as const

export const ARKADE_BALANCE_BUMPER_INFOMODE = {
  title: 'Bumper wallet (exit fees)',
  text: 'On-chain Bitcoin reserved to pay miner fees during unilateral exit. This is not spendable Arkade balance — fund it from on-chain send if unroll fees are too low.',
} as const

export const ARKADE_DELEGATOR_FEE_INFOMODE = {
  title: 'Delegator renewal fee',
  text: 'A Fulmine delegator submits presigned VTXO renewals while the app is closed. This small per-renewal fee pays for that service. The delegator cannot redirect your funds—it only broadcasts renewals you already signed.',
} as const

export const ARKADE_RENEW_VTXOS_INFOMODE = {
  title: 'Renew VTXOs now',
  text: 'Each virtual balance unit (VTXO) must be renewed before it expires, or it falls back to a slower on-chain path. Use this while unlocked if you want to renew manually instead of relying on the delegator.',
} as const

export const ARKADE_VTXO_EXPIRY_INDICATOR_INFOMODE = {
  title: 'VTXO expiry',
  text: 'Each offchain virtual balance unit (VTXO) has an expiry time. Renew before then to stay on the fast Arkade path. The date shown is the soonest expiry among your current VTXOs. Amber text means some are already in the renewal window.',
} as const

export const ARKADE_BOARDING_ADDRESS_INFOMODE = {
  title: 'Boarding address',
  text: 'A special on-chain address used only to move Bitcoin into Arkade. Do not confuse it with your normal bc1 receive address or your ark1/tark1 Arkade receive address.',
} as const

export const ARKADE_BOARD_STATUS_READY_INFOMODE = {
  title: 'Ready to settle',
  text: 'Confirmed on-chain funds at your boarding address that you can settle into Arkade now. Use the Settle boarding UTXO button.',
} as const

export const ARKADE_BOARD_STATUS_EXPIRED_INFOMODE = {
  title: 'Unilateral exit only',
  text: 'Boarding funds that missed the cooperative settle window. You can still recover them, but only via a slower unilateral on-chain path—not by settling into Arkade.',
} as const

export const ARKADE_SEND_PAYMENT_INFOMODE = {
  title: 'Arkade payment',
  text: 'Sends Bitcoin over the Arkade offchain layer to an ark1 or tark1 address. Payments are instant and do not use on-chain miner fees—the recipient must use Arkade, not a regular bc1 wallet.',
} as const

export const ARKADE_ACTIVITY_PAYMENT_INFOMODE = {
  title: 'Arkade payment',
  text: 'An offchain payment on the Arkade layer (virtual balance units), separate from on-chain Bitcoin or Lightning activity on this dashboard.',
} as const

export const ARKADE_ACTIVITY_BOARDING_INFOMODE = {
  title: 'Arkade boarding',
  text: 'Funds moving from on-chain Bitcoin into Arkade—either a send to the boarding address or a settle step that created new VTXOs.',
} as const
