# Crypto-owned descriptor spends (UTXO lease + `signAnchorChild`)

Planning note for the **next** architecture after bumper persistence. Nothing here is implemented.

Related:

- Wallet session (prerequisite): [crypto/docs/wallet-session-migration.md](../../crypto/docs/wallet-session-migration.md)
- Exit proceed / `submitpackage`: [unilateral-exit.md](../unilateral-exit.md)
- Bumper vs on-chain BDK: [arkade-bitboard-wallet-model.md](../arkade-bitboard-wallet-model.md)
- Descriptor rows: [descriptor-wallet-switching.md](../descriptor-wallet-switching.md)
- Unlock Esplora / lazy bumper (already shipped): [unlock-esplora-full-scan-instead-of-sync.md](./unlock-esplora-full-scan-instead-of-sync.md)

---

## Immediate work (not this document)

Bumper BIP84 account 0 is the same HD account as the SegWit-0 descriptor row. Persist and hydrate that row so there is one changeset; do **not** freeze the whole SegWit wallet during automatic proceed. Details belong in that follow-up, not here.

This note is the step **after** that: one spender for descriptor-wallet UTXOs.

---

## Problem

The Arkade bumper is BIP84 `m/84'/{coin}'/0'` from the same mnemonic as the on-chain SegWit account. Crypto (`ACTIVE_WALLET` / later `WalletSession`) and Arkade (`ark-bdk-wallet` `create_wallet_no_persist`) each keep a BDK and can broadcast spends of the same confirmed coins.

Typical overlap: automatic unilateral proceed CPFP while the user (or another app with the same seed) sends from SegWit-0. The chain will not confirm both spends. The bad outcome is an unroll that has started (`register_host_tx_observation` before broadcast) but **lost its fee-child**, which extends the “finish quickly if the ASP is still online” window. A wallet-wide write lock would prevent that and also lock coin-control users out of **unrelated** SegWit UTXOs.

A generic “enqueue an on-chain send” is the wrong API. Arkade CPFP is not `prepareOnchainSendTransaction` (address + amount). It is a v3 child that spends a foreign 0-value P2A plus a BIP84 coin, then `submitpackage([unroll_parent, child])`. Success is **package accepted**, not “payment sent.”

---

## Invariant

Only the **crypto worker** may select, reserve, sign, and persist spends from a descriptor wallet.

Arkade still owns the exit state machine, the unroll parent, and (unless we later unify broadcasting) `submitpackage`. Main thread already mediates worker RPCs; workers do not talk peer-to-peer.

Scope is **BDK-account spends** only. Lightning **commitment** transactions stay in the Lightning worker. Channel **funding** (and later on-chain splice/close) is the same class of problem and should use this lease later — not part of the first cut.

---

## Target API

Names can change; the split must not.

| Call (crypto) | Role |
|---------------|------|
| `reserveConfirmedCoins({ walletKey, needSats, purpose })` | Pick **confirmed** outpoints; mark them leased. Fail with a typed insufficient-funds error (maps to today’s `bumperInsufficient`). |
| `signAnchorChild({ parentTx, reservedOutpoints, feeRate })` | Build and sign the CPFP child (same job as `ark_core::build_anchor_tx` + `OnchainWallet::sign`). Foreign P2A input is not a BDK coin. Closest existing pattern: lab entity “foreign UTXO + wallet sign.” |
| `releaseLease(leaseId)` | Always on package reject, timeout, or abort so those coins are spendable again. |
| User `prepareOnchainSend` / coin control | Same selector; **cannot** take leased outpoints. Other SegWit UTXOs stay spendable. |

Serialization: one coin-select at a time **inside** crypto (a queue). That queue is an implementation detail, not Arkade’s public API.

`walletKey` is the existing descriptor identity `(network, addressType, accountId)` — bumper is SegWit account 0.

### What Arkade waits for

Proceed today: sync bumper → `bump_tx_at_fee_rate` → `broadcast_package`. After this change:

1. Arkade builds / already has the unroll parent.
2. Main thread: `reserveConfirmedCoins` then `signAnchorChild`.
3. Arkade (or crypto, if we centralize broadcast) submits the package.
4. Arkade continues only when **package accepted** (same success as today’s `broadcast_unilateral_exit_step_at_fee_rate` Ok path, including redundant-broadcast / already-relayed handling in [proceed.rs](../../bitboard-ark/src/session/unilateral_exit/proceed.rs)).
5. On `package-not-child-with-unconfirmed-parents` or other reject: `releaseLease`, existing `waitingForParentData` / retry / pause policy. Do not treat “child signed” as done.

Do not persist a “send succeeded” note or advance the job DAG on sign-only.

---

## End state for BDK

Crypto is the **only writer** of the SegWit-0 changeset. Arkade must not keep a second spending BDK that `apply_update`s and later overwrites `descriptorWallets[]`. After the immediate persist work, dual **scanners** are still dual writers if Arkade’s ephemeral wallet keeps syncing and exporting.

Preferred: Arkade asks crypto for coins and signatures; bumper address / confirmed balance for UI can be reads against the same session (or a tip `/utxo` probe that does not mutate the graph).

Taproot-as-default means BIP86 stays in the committed slot while bumper is BIP84. That **requires** [WalletSession Phase 1/2](../../crypto/docs/wallet-session-migration.md): a sidecar session for SegWit-0 without unloading Taproot. Phase 0 (read-only probe) is not enough — this path signs.

Until Phase 1/2, this RPC cannot land on the right wallet for Taproot-default users. Do not implement `signAnchorChild` on `ACTIVE_WALLET` only.

---

## Happy path (automatic proceed)

```mermaid
sequenceDiagram
  participant Job as Exit job (main)
  participant Ark as arkade.worker
  participant Cry as crypto.worker
  participant Net as Esplora submitpackage

  Job->>Ark: proceed step
  Ark->>Ark: unroll parent hex
  Ark->>Job: need CPFP child
  Job->>Cry: reserveConfirmedCoins(segwit-0)
  Cry-->>Job: leaseId, outpoints
  Job->>Cry: signAnchorChild(parent, outpoints, feeRate)
  Cry-->>Job: child hex
  Job->>Ark: child hex
  Ark->>Net: submitpackage([parent, child])
  alt accepted or already relayed
    Net-->>Ark: ok
    Ark-->>Job: step attempted
    Note over Cry: lease consumed; persist changeset
  else reject
    Net-->>Ark: error
    Ark-->>Job: waitingForParentData / bumper error
    Job->>Cry: releaseLease
  end
```

User send mid-exit: crypto coin-select skips leased outpoints. If the user needs those exact coins, the send fails with a clear “reserved for unilateral-exit CPFP” error — not a disabled SegWit wallet.

---

## Failure and safety

- **Lease without release** (tab crash mid-sign): treat leases as session-scoped; drop on crypto-worker restart / unlock. Chain is source of truth after Esplora sync.
- **Sign ok, package never submitted**: release on Arkade/main timeout; do not leave coins reserved across a new proceed attempt without a new reserve.
- **Register-before-broadcast** (existing): unchanged. A signed child that never packages must not skip observation cleanup rules in [unilateral-exit.md](../unilateral-exit.md).
- **Stale sidecar session**: after `signAnchorChild`, export/persist the SegWit-0 changeset the same way a user send does, so the committed Taproot slot is not the only graph that gets saved.

---

## Out of scope

- Transaction **notes** (“CPFP for unilateral exit step N”). Attach a txid + purpose when the package is accepted; does not require this API, and must not drive it.
- Wallet-wide write lock during automatic proceed.
- Changing Ark Labs BIP84 account 0 (exotic derivation would hide the bumper from “main” SegWit UX; it would not remove the two-spender problem by itself).
- Lightning commitment / HTLC signing.
- Teaching `prepareOnchainSendTransaction` about P2A parents.

---

## Suggested implementation order (when this ticket starts)

1. WalletSession that can **sync + sign** SegWit-0 beside a loaded Taproot slot (Phase 1 minimum; Phase 2 if send/export should not stay on globals).
2. In-crypto lease table + user-send exclusion (unit tests first: cannot select leased outpoints; release restores them).
3. `signAnchorChild` parity with `build_anchor_tx` (v3, P2A + reserved inputs, change to next unused, fee as package feerate).
4. Wire proceed through main-thread reserve → sign → Arkade `submitpackage` → release on failure; keep existing package-error classification.
5. Stop Arkade bumper BDK from selecting/signing/persisting spends (reads only, or remove the ephemeral wallet).

TDD: yaml contracts on “other SegWit UTXOs remain spendable while a CPFP lease is held” and “proceed does not advance on sign-only.” Prefer Rust/unit for lease + PSBT shape; existing `ARK-EXIT-*` / proceed error mapping for the package-accepted wait.
