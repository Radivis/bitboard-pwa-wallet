# On-chain data and Bitboard wallets

This document records how Bitboard handles **on-chain balance and transaction display** relative to **Bitboard wallets** (`wallet_id`) and **descriptor sub-wallets**.

## BDK changeset is the single source of truth

- **Balance and transaction history** come from the BDK wallet loaded in WASM from `DescriptorWalletData.changeSet` (encrypted inside `wallet_secrets`).
- After unlock or network switch, the app reads `getBalance()` and `getTransactionList()` from the loaded BDK wallet immediately — no duplicated tx/balance cache in the encrypted payload.

## Last successful Esplora sync timestamp

- Each descriptor sub-wallet may store `lastSuccessfulEsploraSyncAt` (ISO string): when Esplora sync last completed successfully for that sub-wallet.
- Used only for **stale UX** (“last verified with Esplora”) when the current session has not completed Esplora sync yet or sync failed.
- **Not set** on lab mode or WASM-only paths without Esplora.

## Lab mode

- Lab on-chain activity comes from the lab SQLite simulator, not BDK/Esplora snapshots or timestamps.

## Lightning (unchanged)

- Lightning NWC balance/history snapshots remain separate; see [`lightning-bitboard-wallet-model.md`](lightning-bitboard-wallet-model.md).
