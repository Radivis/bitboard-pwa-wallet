export const GUIDE_AREA_INTRODUCTIONS = {
  guides: {
    title: 'Bitcoin Codex Guides',
    paragraphs: [
      'The Bitcoin Codex guides are brief and practical instructions on various topics.',
      'They are there to get you started quickly, not for demonstrating a perfect approach.',
      'By the way: This introduction is one of those guides.',
    ],
  },
  library: {
    title: 'Bitcoin Codex Library',
    paragraphs: [
      'The Bitcoin Codex Library contains many articles about various topics related to Bitcoin. Those let you explore the theoretical foundations of the technology behind Bitcoin. This is not a textbook. The articles are there to give you a general idea how things work without having to know every last detail.',
    ],
  },
  lab: {
    title: 'Bitcoin Codex Lab',
    paragraphs: [
      'The Bitcoin Codex Lab is an offline blockchain simulator. It lets you play around with transactions and blocks, so that you can inspect how they work. You can create multiple simulated personas, the so-called Lab entities. Transactions can move between those entities and your own “Labnet” wallet. This simulator creates a tiny actual blockchain on your device with simplified rules. It does not communicate with the internet. Think of it as your own personal Bitcoin sandbox. The Lab is ideal, if you want to play around with test-coins quickly, since you don’t have confirmation waiting times in the Lab.',
    ],
  },
  wallet: {
    title: 'Bitcoin Codex Wallet',
    paragraphs: [
      'Most wallets let you interact with the real Bitcoin Mainnet directly, because they assume you are already familiar with how Bitcoin works. In many cases, that assumption is reasonable, but Bitcoin Codex is an educational app that doesn’t assume any prior knowledge about Bitcoin. Instead, you start on Testnet, the primary online test network for Bitcoin. You can easily get “Testcoins” for free from online services called faucets. That way, you can experiment safely with sending and receiving coins before graduating to Mainnet, which contains real Bitcoins. Note that you have to activate certain wallet features before you can use them - including Mainnet access. Features can be unlocked in the Settings area.',
    ],
  },
  settings: {
    title: 'Bitcoin Codex Settings',
    paragraphs: [
      'The Bitcoin Codex settings are a dedicated area of the app, because there are quite a lot of settings. This area also contains some special functionality like data exports and imports. Please note that those are specific to Bitcoin Codex and cannot be used by other apps. Under “Features” you can unlock additional functionality within this app. If you want to interact with actual Bitcoins, you need to activate “Mainnet access” first.',
    ],
  },
} as const
