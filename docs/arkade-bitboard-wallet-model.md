# Arkade and Bitboard wallets

This document records how Bitboard scopes **Arkade (VTXO / offchain)** relative to **Bitboard wallets** (`wallet_id`) and **on-chain BDK** descriptor wallets.

For network switching and Esplora, see [`descriptor-wallet-switching.md`](descriptor-wallet-switching.md). For on-chain balance authority, see [`onchain-bitboard-wallet-model.md`](onchain-bitboard-wallet-model.md).

## Separate rail, not BDK changeset

- **On-chain** balance and history come from the BDK wallet (`DescriptorWalletData.changeSet`) and Esplora sync.
- **Arkade** balance and history come from the Arkade operator and SDK (`@arkade-os/sdk`) in `arkade.worker`.
- Do not merge Arkade totals into the BDK dashboard balance.

## One Bitboard wallet, one Arkade context per live network

- Arkade state is stored per `(wallet_id, networkMode)` for `mainnet`, `testnet`, and `signet` (Mutinynet).
- Metadata and **full SDK repo state** (`sdkPersistenceJson`) live in encrypted `wallet_secrets` (`arkadeWallets[]`). Balance and history come from the hydrated SDK session (worker), not a separate snapshot field.
- **Local-first:** VTXO and contract data are authoritative on device after unlock. The Arkade operator is used for cooperative boarding, send, and settlement when online—not required to load wallet state from disk.
- **Unlike NWC:** Lightning snapshots are stale cache when the node is down; Arkade `sdkPersistenceJson` is the source of truth for offchain UTXOs (future unilateral exit reads this blob + Esplora, not the operator).

## SDK storage in the worker (inner vs proxied repos)

`createPersistingArkadeStorage` builds **one** in-memory `WalletRepository` + `ContractRepository` pair per session:

| Handle | Role |
|--------|------|
| `inner*Repository` | Plain SDK in-memory repos. Hydrate from `sdkPersistenceJson` on open; export full repo state on flush. |
| `walletRepository` / `contractRepository` | Proxies around the same instances. Passed to `Wallet.create` so SDK writes schedule a debounced persist to `wallet_secrets`. |

Flush uses the **inner** handles because export reads repository maps via a direct field snapshot (not through the proxy). The SDK mutates the same underlying data through the proxies. Critical worker RPCs (send, onboard, delegate, etc.) also call an immediate flush.

## Exiting to on-chain

Management → Arkade offers two paths:

| Path | Operator required | Use when |
|------|-------------------|----------|
| **Collaborative exit** | Yes | Default; batches with operator; one settlement to your `bc1` address |
| **Unilateral exit** | No (after unroll) | Operator down or you need trustless exit; per-VTXO; multiple on-chain txs |

Collaborative exit calls `Ramps.offboard` in `arkade.worker`. Unilateral exit uses `Unroll.Session` (P2A fees paid from an SDK `OnchainWallet` bumper derived from the same mnemonic) then `Unroll.completeUnroll` after the CSV timelock. Select one VTXO at a time in the UI.

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
