export const walletKeys = {
  all: ['wallets'] as const,
  byId: (id: number) => ['wallets', id] as const,
}
