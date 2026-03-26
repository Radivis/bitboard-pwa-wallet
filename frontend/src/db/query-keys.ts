export const walletKeys = {
  all: ['wallets'] as const,
  byId: (id: number) => ['wallets', id] as const,
}

export const libraryKeys = {
  favorites: ['library', 'favorites'] as const,
}
