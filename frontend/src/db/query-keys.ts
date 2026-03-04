export const walletKeys = {
  all: ['wallets'] as const,
  byNetwork: (network: string) => ['wallets', { network }] as const,
  byId: (id: number) => ['wallets', id] as const,
}
