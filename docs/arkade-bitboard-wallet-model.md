# Arkade and Bitboard wallets

This document records how Bitboard scopes **Arkade (VTXO / offchain)** relative to **Bitboard wallets** (`wallet_id`) and **on-chain BDK** descriptor wallets.

For network switching and Esplora, see [`descriptor-wallet-switching.md`](descriptor-wallet-switching.md). For on-chain balance authority, see [`onchain-bitboard-wallet-model.md`](onchain-bitboard-wallet-model.md).

## Separate rail, not BDK changeset

- **On-chain** balance and history come from the BDK wallet (`DescriptorWalletData.changeSet`) and Esplora sync.
- **Arkade** balance and history come from the Arkade operator and **ark-rs** (`bitboard-ark` WASM) in `arkade.worker`.
- Do not merge Arkade totals into the BDK dashboard balance.

## One Bitboard wallet, one Arkade context per live network

- Arkade state is stored per `(wallet_id, networkMode)` for `mainnet`, `testnet`, and `signet` (Mutinynet).
- Metadata and **persistence v2** (`sdkPersistenceJson`, engine `ark-rs`) live in encrypted `wallet_secrets` (`arkadeWallets[]`). Balance and history come from the hydrated session (worker), not a separate snapshot field.
- **Local-first:** VTXO and contract data are authoritative on device after unlock. The Arkade operator is used for cooperative boarding, send, and settlement when online—not required to load wallet state from disk.
- **Unlike NWC:** Lightning snapshots are stale cache when the node is down; Arkade `sdkPersistenceJson` is the source of truth for offchain UTXOs (future unilateral exit reads this blob + Esplora, not the operator).

## Persistence in the worker

`bitboard-ark` exports a JSON envelope (`version: 2`) after critical RPCs and on `closeSession`. v1 TypeScript SDK snapshots are ignored on unlock (one-time console notice); users re-board on unreleased builds.

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
