export const COINGECKO_EXCHANGES_URL = 'https://www.coingecko.com/en/exchanges'

export const EXCHANGE_GUIDE_INTRO_PARAGRAPHS = [
  'On an exchange you can buy Bitcoin with regular old-fashioned money or other cryptocurrencies.',
  'It is strongly recommended to stick to regulated exchanges in your area, especially if you are new to Bitcoin.',
  'You open an account at the exchange, transfer some money onto that account and then buy Bitcoin in your account.',
] as const

export interface ExchangeGuideStepContent {
  step: number
  title: string
  paragraphs: readonly string[]
  linkHref?: string
  comicSrc: string
  comicAlt: string
  comicWidth: number
  comicHeight: number
}

export const EXCHANGE_GUIDE_STEPS: readonly ExchangeGuideStepContent[] = [
  {
    step: 1,
    title: 'Exchange Selection',
    paragraphs: ['Pick an exchange. The following site is a good starting point:'],
    linkHref: COINGECKO_EXCHANGES_URL,
    comicSrc: '/comics/get-bitcoins/get-bitcoins-1-exchange-comparison.jpg',
    comicAlt: 'Comparing crypto exchanges on a laptop',
    comicWidth: 1712,
    comicHeight: 1152,
  },
  {
    step: 2,
    title: 'Registration and Verification',
    paragraphs: [
      'Create an account. You will have to enter some personal data and get verified. The verification can take some time.',
    ],
    comicSrc: '/comics/get-bitcoins/get-bitcoins-2-KYC-booth.jpg',
    comicAlt: 'A verification booth for opening an exchange account',
    comicWidth: 1712,
    comicHeight: 1152,
  },
  {
    step: 3,
    title: 'Bitcoin Purchase',
    paragraphs: ['Purchase Bitcoin (BTC) on the exchange via bank transfer (slow) or card (expensive).'],
    comicSrc: '/comics/get-bitcoins/get-bitcoins-3-BuyBitcoins.jpg',
    comicAlt: 'Buying bitcoin on an exchange',
    comicWidth: 1168,
    comicHeight: 784,
  },
  {
    step: 4,
    title: 'Coin Transfer',
    paragraphs: [
      'Go on the receive page of your Bitcoin Codex wallet and copy the displayed code.',
      'On the exchange select Bitcoin as currency, if supported, paste the code, select a moderate fee, and confirm. It may take up to an hour for the transfer to complete.',
      'Bonus: Once you have Lightning set up, and the exchange supports that, choose that as currency instead.',
    ],
    comicSrc: '/comics/get-bitcoins/get-bitcoins-4-WithdrawBitcoins.jpg',
    comicAlt: 'Withdrawing bitcoin from an exchange into a wallet',
    comicWidth: 1168,
    comicHeight: 784,
  },
]

export function parseExchangeGuideStep(stepParam: string): number | null {
  const step = Number(stepParam)
  if (!Number.isInteger(step) || String(step) !== stepParam) return null
  if (!EXCHANGE_GUIDE_STEPS.some((entry) => entry.step === step)) return null
  return step
}

export function exchangeGuideStepContent(step: number): ExchangeGuideStepContent {
  const content = EXCHANGE_GUIDE_STEPS.find((entry) => entry.step === step)
  if (!content) {
    throw new Error(`Unknown exchange guide step: ${step}`)
  }
  return content
}
