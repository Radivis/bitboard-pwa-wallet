---
name: Bark Signet Rail
overview: A staged plan for a keepable Bark rail. A thin Rust crate compiles bark-wallet to WASM, a dedicated worker holds the session, and the first product slice is public-Signet receive, sync, balance, and an arkoor send. Bark owns protocol state. Later capabilities are new exports on that session.
todos:
  - id: stage-0-wasm-spike
    content: "Stage 0: bitboard-bark depends on bark-wallet and wasm-pack build succeeds, or the crate moves to its own Cargo workspace if Bark patches break the build"
    status: pending
  - id: stage-1-session
    content: "Stage 1: bark.worker opens and closes a Signet Wallet from the secrets-channel mnemonic, with Bark IndexedDB persistence and no daemon"
    status: pending
  - id: stage-2-receive
    content: "Stage 2: Peek the current Ark address and reveal the next one only on user action, behind a default-off feature flag"
    status: pending
  - id: stage-3-balance
    content: "Stage 3: Explicit sync and a Bark spendable balance that is not added to the on-chain or Bark totals"
    status: pending
  - id: stage-4-send
    content: "Stage 4: Arkoor send to a Bark Ark address on public Signet"
    status: pending
isProject: false
---

# Bark Signet rail

Bark is a second Ark rail beside Arkade. It uses Second's `bark-wallet` crate (0.7.x), compiled to WASM the same way `bitboard-ark` is, and it talks to Second's public Signet. It does not talk to Mutinynet, and it does not share VTXOs with Arkade.

## Decisions already made

- **Shape.** New crate `bitboard-bark` (`cdylib` + `rlib`). `wasm-pack --target bundler` writes `frontend/src/wasm-pkg/bitboard_bark`. `bark.worker.ts` loads it and exposes a small Comlink API. The mnemonic is decrypted on the secrets channel and never sits on the main thread. Lock terminates the worker.
- **SDK surface.** The crate is a session shell around `bark::Wallet`. One WASM export per operation the UI calls. Do not port Arkade's unilateral-exit machine, signer migration, autonomous mode, operator-trust diffs, or Fulmine delegator.
- **Features on wasm.** Disable `bark-wallet` defaults (`native`, `sqlite`, `tls-native-roots`, `bitcoind-rpc`). Enable `wasm-web` and `indexed-db`. Leave `onchain-bdk` off so Bark does not open a second BDK wallet.
- **No daemon.** `OpenWalletArgs.run_daemon = false`. The worker calls `Wallet::sync` on unlock and from periodic sync. `Wallet::balance` is only meaningful after that sync.
- **Persistence.** IndexedDB is the storage for Bark protocol state through these stages. On wasm, open with `bark::persist::platform_default(None, Some(fingerprint))`, which is Bark's IndexedDB `BarkPersister`, keyed by wallet fingerprint. Enable the `indexed-db` feature and leave `sqlite` off. `bark-wallet`'s `sqlite` feature is `rusqlite` plus a filesystem path for native builds. It does not talk to this app's wa-sqlite/OPFS database. Do not implement `BarkPersister` to forward those calls into Kysely. Do not stuff the VTXO database into encrypted `wallet_secrets`. Encrypted metadata in the existing SQLite file is only server URL, network, fingerprint, and last successful sync time.
- **Receive cursor.** `new_address` advances Bark's key index. Dashboard and Receive call `peek_address` on the last stored index. `new_address` runs on first open, when no index exists, and when the user asks for a new address.
- **Network.** `BarkNetwork::Signet`. Server `https://ark.signet.2nd.dev`. Esplora `https://esplora.signet.2nd.dev`. Do not use `getEsploraUrl('signet')`. That URL is Mutinynet (`https://mutinynet.com/api`). This app's signet mode will show Mutinynet on-chain and Arkade coins next to a public-Signet Bark balance. That mismatch is accepted for this stage; the dev database can be wiped.
- **Balance display.** Bark spendable sats are their own figure. They are not added to the BDK total or the Arkade total.
- **One tab.** Bark's wasm lock manager is in-process. Two tabs on one IndexedDB database are out of scope.

## Known gap, not a shortcut

The IndexedDB database is not encrypted at rest, and restore needs both the mnemonic and that database. A later backup can export that store into the encrypted wallet backup. Building a custom persister, whether to encrypt the rows or to land them in wa-sqlite, would fork a schema Second migrates. Bitboard's SQLite holds app metadata. It does not become Bark's database by sharing a process.

## Out of scope until the four stages below are done

History, Lightning send and receive, boarding through `board_funding_address` / `board_psbt`, VTXO refresh, emergency exit, Mutinynet, an encrypted backup of the IndexedDB store, and a `BarkPersister` aimed at wa-sqlite. Protocol features are further exports on the same session. Replacing IndexedDB is a separate project and stays off this list until a Signet send works on Bark's own backend.

## Stage 0 — The crate links

Add `bitboard-bark` to the workspace and depend on `bark-wallet` with the wasm features above. Export nothing beyond a compile-time smoke function if that is what it takes to link. Run `wasm-pack build --target bundler`.

The workspace `[patch.crates-io]` entries replace `esplora-client` and the Arkade crates for every member. Bark uses its own `ark` stack, not Arkade's `ark-core`, but Cargo still unifies shared crates. If those patches or a `bitcoin` feature unify make the wasm build fail, move `bitboard-bark` to its own Cargo workspace. Do not vendor Bark to get past the patch.

**Done when** `wasm-pack build` of `bitboard-bark` succeeds, and the crate is either a workspace member or an isolated workspace with the reason recorded in its `Cargo.toml` comment.

Also confirm, with one call from the built module or a tiny native harness, that the public Signet server and `https://esplora.signet.2nd.dev` answer from this environment. Bark's browser SDK is built to call them directly. If the worker hits CORS, add a same-origin proxy then. Do not add one speculatively. Second's Esplora is not the app's Mutinynet proxy.

## Stage 1 — Session open and close

WASM exports:

- `bark_open_session` — mnemonic, Signet, the two Second URLs. `Wallet::open` with `create_if_not_exists`, `run_daemon: false`, `onchain: None`, and `platform_default`'s IndexedDB persister. Returns the fingerprint.
- `bark_close_session` — drop the thread-local `Wallet`.

`bark.worker.ts` follows `arkade.worker.ts`: secrets channel for the mnemonic, session opened when the wallet unlocks, worker terminated on lock. A default-off feature flag (`isBarkEnabled`, same store pattern as `isArkadeEnabled`) gates worker start. No receive or balance UI yet.

Write the small encrypted metadata row on successful open. Opening must not re-encrypt the VTXO database.

**Done when** unlock with the flag on opens a Signet wallet, reload reopens the same IndexedDB via fingerprint, and lock drops the worker without deleting that database.

## Stage 2 — Receive address

Exports:

- `bark_peek_receive_address`
- `bark_reveal_next_address`

Show the address on the existing Receive surface when the flag is on and the app network mode is signet. QR is enough. "Generate new address" is the only control that calls reveal.

Specify this screen in `doc/features/bark.yaml` before the UI work (user story, visible elements, the peek-vs-reveal rule). Tests cover that reveal does not run on render, reopen, or unlock.

**Done when** a fresh wallet shows a stable Ark address across reload, and a second address appears only after the user generates one.

## Stage 3 — Sync and balance

Exports:

- `bark_sync` — `Wallet::sync`, then stamp last successful sync time.
- `bark_balance` — map `Balance.spendable` to sats. Call it only after a sync in this session.

Dashboard shows that figure on its own row when the flag is on. Periodic sync may call `bark_sync` on the same interval policy as the other rails. A failed sync keeps the last shown balance and surfaces the existing rail error pattern.

**Done when** a Signet faucet payment to the peeked address shows up in the Bark spendable figure after sync, and neither the on-chain total nor the Arkade total changes because of it.

## Stage 4 — Arkoor send

Export `bark_send_arkoor` as `Wallet::send_arkoor_payment`. The send form accepts a Bark Ark address, estimates with `estimate_arkoor_payment_fee` when that call is cheap, sends, then syncs and refreshes the balance. Refuse addresses that fail `validate_arkoor_address` (wrong server). Do not offer an Arkade address as a valid destination.

**Done when** a payment from this wallet to a second Bark Signet wallet reduces the sender's spendable balance and, after sync, increases the recipient's.

## After stage 4

Add capabilities in this order, each as exports plus UI on the session from stage 1:

1. `Wallet::history` on the activity list.
2. Lightning receive (`bolt11_invoice`) and send (`pay_lightning_invoice`). This is the user-visible difference from Arkade.
3. Boarding from the existing on-chain wallet via `board_funding_address` and `board_psbt`. Still no `onchain-bdk`.
4. Delegated refresh for VTXOs near expiry.
5. Emergency exit, using Bark's exit manager rather than the Arkade unroll UI.
6. Backup of the IndexedDB store into the encrypted wallet backup.

Mutinynet waits until `ark.mutinynet.2nd.dev` is confirmed up. It is a different `BarkNetwork` and a different chain source (`https://mutinynet.com/api`), not a flag on the Signet session.
