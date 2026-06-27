# Arkade and Bitboard wallets

This document records how Bitboard scopes **Arkade (VTXO / offchain)** relative to **Bitboard wallets** (`wallet_id`) and **on-chain BDK** descriptor wallets.

For network switching and Esplora, see [`descriptor-wallet-switching.md`](descriptor-wallet-switching.md). For on-chain balance authority, see [`onchain-bitboard-wallet-model.md`](onchain-bitboard-wallet-model.md).

## Separate rail, not BDK changeset

- **On-chain** balance and history come from the BDK wallet (`DescriptorWalletData.changeSet`) and Esplora sync.
- **Arkade** balance and history come from the Arkade operator and **ark-rs** (`bitboard-ark` WASM) in `arkade.worker`.
- Do not merge Arkade totals into the BDK dashboard balance.

## One Bitboard wallet, operator connections per live network

- Arkade state is stored as **operator connections** in encrypted `wallet_secrets` (`arkadeOperatorConnections[]`), NWC-style. Each connection is one ASP with its own `sdkPersistenceJson`, URLs, and canonical `operatorSignerPkHex` from `getInfo`.
- `activeArkadeConnectionIdByNetwork` picks the connection used for session, dashboard, and sync on `mainnet`, `testnet`, and `signet` (Mutinynet). Switching operators is adding/switching connections—not merging blobs across ASPs.
- **BitboardArkPersistence** (`sdkPersistenceJson`, engine `ark-rs`, wire `version: 3`) includes `operator_identity` and an `offchain_vtxo_snapshot` inside `wallet_db`. Balance and history read from the loaded WASM session immediately after unlock (local snapshot + Esplora boarding + on-chain bumper).
- **Operator sync** (`sync_with_operator`) refreshes the snapshot and re-exports `sdkPersistenceJson` to the active connection row. `lastSuccessfulOperatorSyncAt` on the connection mirrors `lastSuccessfulEsploraSyncAt` for on-chain BDK.
- **Local-first:** Operator failure during a session keeps the last-synced blob; the dashboard may show a stale banner until operator sync succeeds this unlock.

## Persistence in the worker

`bitboard-ark` exports a `BitboardArkPersistence` JSON envelope (`version: 3`) after critical RPCs, operator sync, and on `closeSession`. Unsupported or malformed blobs start from an empty `wallet_db` on session open.

### Offchain receive derivation cursor

`walletDb` inside `sdkPersistenceJson` stores the offchain receive cursor as **one scalar**:

- `offchain_next_derivation_index: u32` — next index to assign on reveal (`Bip32KeyProvider::next_index`); after the first reveal of index `0`, the value is `1`.
- Display index on peek: `max(0, offchain_next_derivation_index - 1)` when `next > 0`, else `0` on first use.

Do **not** persist arrays of derivation indices or per-index metadata in `sdkPersistenceJson`; that pattern bloated encrypted secrets and caused failed writes. Session open restores the scalar, warms the key cache locally for `0..index`, and read paths (`getAddress`, balance, history) never block on wallet-secrets re-encrypt.

Operator access from the browser uses **REST** (`ark-rest` + grpc API shim), not grpc-web.

## Exiting to on-chain

Management → Arkade offers two paths:

| Path | Operator required | Use when |
|------|-------------------|----------|
| **Collaborative exit** | Yes | Default; batches with operator; one settlement to your `bc1` address |
| **Unilateral exit** | No (after unroll) | Operator down or you need trustless exit; per-VTXO; multiple on-chain txs |

Collaborative exit and unilateral unroll are implemented in `bitboard-ark` (`collaborative_redeem`, `broadcast_next_unilateral_exit_node`, etc.). The on-chain bumper wallet shares the same BIP32-derived BDK wallet as boarding. Select one VTXO at a time in the UI.

## Mnemonic alignment

- Same BIP39 mnemonic as the Bitboard wallet; Arkade uses `MnemonicIdentity` (BIP86 account 0).
- Arkade **receive addresses** (`ark1` / `tark1`) differ from on-chain `bc1` receive addresses.
- `delegatorProvider` is set at **first** Arkade wallet creation per network; it changes the offchain tapscript.

## Delegator (Fulmine)

- Default delegator URLs are selected by `NetworkMode` (see `arkade-endpoints.ts`).
- Bitboard-hosted Fulmine renews VTXOs without holding user keys (presigned intents).
- Users should read Library / SECURITY for operator and delegator trust.

## Lab and regtest

- **Lab** and **regtest** have no Arkade UI in v1.
- Regtest Fulmine is reserved for a later phase.

## Lightning

- Arkade is an alternative L2 path for education, not a replacement for optional NWC Lightning connections.

## Operator signer rotation

When an Arkade operator rotates its signing key, `getInfo` advertises the new `signerPubkey` and lists the previous key under `deprecatedSigners` with a cooperative cutoff timestamp. Bitboard uses **rust-sdk** rotation support (`Info::signer_status_at`, `migrate_deprecated_signer_vtxos`, deprecated-aware `discover_keys`).

| Regime | Condition | Bitboard behavior |
|--------|-----------|-------------------|
| **Current** | Stored signer matches live signer | Normal session |
| **Migratable / Due now** | Stored signer is deprecated, cooperative window open | Session opens; banner may offer cooperative migration to current signer |
| **Expired** | Deprecated signer past cutoff | Session opens for recovery; cooperative send/migrate unavailable; unilateral exit or recoverable settle |

Contracts `ARK-ROT-01` through `ARK-ROT-05` in `doc/features/arkade.yaml` define session open, persistence re-stamp, error messaging, and Management banner behavior.

Cooperative fund migration uses `migrate_deprecated_signer_vtxos()` (ark-client 0.9.3+). Post-cutoff funds appear in `pending_recovery` until unilateral exit or recoverable settlement. This is **not** the admin `WalletInitializerService_Restore` API (operator on-chain wallet setup only).
