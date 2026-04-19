# Security

This document describes how Bitboard Wallet keeps user credentials and wallet secrets safe, and states inherent limitations of the web / PWA environment.

For **reporting vulnerabilities** in Bitboard Wallet, see the repository root [SECURITY.md](../SECURITY.md).

---

## 1. Threat model

**Scope:** Local PWA, no backend. All assets and API calls go to Esplora (or a dev proxy). There are no server-side secrets.

- **In scope:** Browser storage (SQLite/OPFS, settings), worker and main-thread handling of passwords/mnemonics/keys, Esplora URLs and validation, input validation (addresses, amounts, descriptors, URLs), dependency advisories.
- **Out of scope:** Physical access, OS-level attacks, and full penetration testing.

---

## 2. Security measures

### 2.1 Sensitive data: creation, storage, and clearing

**Where secrets are created**

- **Mnemonic:** Generated only in the **crypto worker** via WASM (`generate_mnemonic`). It is never sent to the main thread except when intentionally shown to the user (create backup step, seed phrase backup).
- **Password:** Comes only from user input. It is held in the **session store** (`password: string | null`) and used when unlocking, syncing, or updating wallet state.
- **Derived keys:** Created only inside the **encryption worker**: Argon2id (WASM) then Web Crypto `importKey` for AES-GCM. Used only for encrypt/decrypt; the raw key buffer is zeroed with `fill(0)` after `importKey`. A comment in code notes that Web Crypto may retain internal copies of the key.

**Worker-to-worker secrets channel**

- The main thread never sees decrypted wallet secrets (mnemonic, or the wallet **payload** JSON that holds descriptor sub-wallets and Lightning metadata). A **MessageChannel** connects the encryption worker and the crypto worker; the main thread creates the channel and passes one port to each worker (using Comlink `transfer()` so ports are transferred, not cloned). It never reads from that channel.
- Decrypt/encrypt for “resolve descriptor wallet” and “update changeset” run via this channel: crypto worker requests decrypt/encrypt from the encryption worker over the port; plaintext secrets stay in the workers. The main thread never sees decrypted wallet secrets: it only passes encrypted blobs between the crypto worker and the app’s DB layer. DB operations are initiated from the main thread via Kysely; the actual SQLite/OPFS access is performed by the WaSqlite worker (Kysely’s `WaSqliteWorkerDialect`), not the main thread.
- The channel is established by `ensureSecretsChannel()` before any operation that needs it. When the user manually locks the wallet, the crypto worker is terminated and `resetSecretsChannel()` is called so that the next unlock re-establishes the channel for a new worker.

**Storage**

- **Encrypted at rest:** The `wallet_secrets` table stores two ciphertexts per wallet row: a **payload** blob (`encrypted_data`, `iv`, `salt`, `kdf_phc`) for the non-mnemonic secrets JSON (descriptor sub-wallets, Lightning NWC metadata), and a **separate mnemonic** blob (`mnemonic_encrypted_data`, `mnemonic_iv`, `mnemonic_salt`, `mnemonic_kdf_phc`). Both are encrypted with the Bitboard app password using **Argon2id** + **AES-256-GCM**; salt and IV are unique per encryption. Each blob has a **PHC-style Argon2id parameter string** (`kdf_phc` / `mnemonic_kdf_phc`) so the correct memory, time, and parallelism costs are always explicit at rest. Two parameter sets are used in practice:
  - **Production (default):** 64 MB memory, 3 iterations, parallelism 4, 32-byte key. Used for new encryption when the app is not built with the CI flag.
  - **CI:** 64 MB memory, 2 iterations, parallelism 1, 32-byte key. Used when `VITE_ARGON2_CI=1` at build time (e.g. in CI for faster tests and E2E), and for decrypting data that was encrypted with these params.
- **Unencrypted:** The `wallets` table (ids, names) and `settings` (e.g. custom Esplora URLs). No passwords or mnemonics are stored in settings.

**Mnemonic vs. payload (moderate hardening, not sub-wallet isolation)**

- The **BIP39 mnemonic is the master secret** from which descriptors are derived. Storing it in a **separate ciphertext** from the rest of the wallet secrets allows many routine operations to **decrypt only the payload** (e.g. updating a sub-wallet changeset, resolving an existing sub-wallet, listing or saving NWC connections) **without** decrypting the mnemonic. The mnemonic is decrypted only when an operation **requires** the seed (e.g. first-time derivation of a new sub-wallet, displaying the backup phrase, re-encrypting all secrets with a new app password). This is **incremental** hardening: it reduces unnecessary exposure of the master seed during normal use; it is **not** a substitute for hardware signing or a compromised-host guarantee.

- **Blast radius:** Bitboard **does not** aim to limit exposure to a **single** descriptor (sub-)wallet. The payload JSON still contains **every materialized** sub-wallet’s descriptors and changesets (plus Lightning connection rows) in one structure; when that payload is decrypted for persistence, **all of that** can exist in memory for that operation. At runtime, **one** BDK wallet is loaded in WASM at a time, which limits **active** signing and chain state—not the contents of the decrypted payload when it is read or written. Further isolation (e.g. separate ciphertext per sub-wallet) would be a larger architectural trade-off and is **not** currently planned.

**Clearing and lock**

- **Session:** `sessionStore.clear()` sets `password: null`. It does **not** overwrite the previous string in memory (see limitations below).
- **Lock:** From Settings, “Lock Wallet” calls `lockWallet()`, terminates the crypto worker, resets the secrets channel, clears the session, and clears the auto-lock timer. No password or mnemonic is stored in URL, `localStorage`, or `sessionStorage`.

### 2.2 Storage and persistence

- **Backend:** SQLite via WaSqlite with OPFS; **two separate database files**: `bitboard-wallet` (wallet persistence: `wallets`, `settings`, `wallet_secrets`) and `bitboard-lab` (lab state: blocks, utxos, lab_addresses, etc.). See [ARCHITECTURE.md](ARCHITECTURE.md).
- **Encryption algorithm:** Argon2id (production: 64 MB, 3 iter, 4 par; CI: 64 MB, 2 iter, 1 par) + AES-256-GCM; 16-byte random salt, 12-byte random IV per encryption. Implemented in the encryption worker and `bitboard_encryption` WASM. Set `VITE_ARGON2_CI=1` when building for CI to use the lighter CI params for new encryption and keep test runs fast.

### 2.3 External communication

- **Esplora:** Used only for chain data and transaction broadcast. Default and custom Esplora URLs are validated with `validateEsploraUrl`; non-regtest/non-lab require HTTPS. No secrets are sent to Esplora; no logging of URLs that could carry sensitive query parameters.

### 2.4 Input and validation

- **Addresses:** Frontend uses `isValidAddress` (prefix check); crypto uses full parsing and network checks.
- **Amounts:** `parseBTC` converts user input to satoshis; it returns 0 for NaN, negative, or non-finite input and clamps to `Number.MAX_SAFE_INTEGER` to avoid overflow. Send flow enforces positive amount and balance checks; WASM rejects zero amounts.
- **Descriptors:** Loaded from encrypted storage or produced by WASM; not user-typed. WASM boundary uses strings/serializable data only; no raw buffer pointers exposed.

### 2.5 Dependencies and audits

- **Rust:** `cargo deny check advisories` runs in CI (see `.github/workflows/audit.yml`). The workspace pins **`ml-dsa`** to **`0.1.0-rc.8`** because upstream has not published a stable **`0.1.0`** on crates.io yet (only `0.1.0-rc.*`); the implementation targets FIPS-204; we will bump when RustCrypto ships a non-RC release.
- **Frontend and landing page:** The same workflow runs Socket CLI for npm in **`frontend/`** and **`landing-page/`** when the API key is set; Socket is optional, but strongly recommended for CI. Lefthook audit steps may be commented out; consider `npm audit` for local pre-push checks.

### 2.6 Logging

- Production code does not log passwords, mnemonics, or key material. Worker init and health checks log only non-sensitive messages. Dev/test components (e.g. CryptoTest) that can display a mnemonic must not be included in production builds or must be behind a dev-only route.

### 2.7 Data exports (local ZIP backups)

Settings let users export the two SQLite databases as ZIP files on their device (nothing is uploaded by this flow).

- **Wallet database export** — The archive includes the wallet SQLite file plus a manifest that **cryptographically signs** a digest of that file using ML-DSA; the signing key is derived from the user’s app password with Argon2id using **fixed backup-signing PHC profiles** (production and CI variants). Import verifies the manifest; verification only accepts those **known backup `kdf_phc` strings**, so manifests cannot smuggle arbitrary Argon2 cost parameters.
- **Lab database export** — The archive contains only the lab SQLite file. There is **no signature and no authenticity guarantee**: integrity depends entirely on trusting the source of the ZIP. Importing a lab backup **replaces local lab state** (simulation / test data on this device). It does **not** by itself compromise main-wallet keys, but a malicious file could spoof lab balances or owners in the UI until the user notices.

---

## 3. Inherent limitations of the web / PWA environment

The following cannot be fully eliminated in a browser-based wallet:

**Session password**

- JavaScript strings are **immutable**. When the session is cleared, we set the store reference to `null`; we cannot overwrite the previous string’s backing memory. That memory may remain until the engine reclaims it. Documented in `sessionStore.clear()`.

**Web Crypto and key material**

- After deriving a key and calling `crypto.subtle.importKey`, we zero our `Uint8Array` with `fill(0)`. The browser’s Web Crypto implementation may still keep **internal copies** of the key; we have no way to clear those.

**No secure element**

- There is no hardware secure element. Keys and secrets exist in process memory and are only as safe as the browser and OS.

**Memory and debugging**

- Process memory can be inspected (e.g. DevTools, debugging, or a compromised machine). Extensions and other scripts in the same origin can potentially observe behavior. We rely on worker isolation and not exposing secrets on the main thread to reduce the attack surface.

**Storage trust**

- OPFS and the browser’s storage are trusted to the same degree as the browser and OS. We do not assume protection against a fully compromised device.

**Physical and OS-level attacks**

- Physical access, keyloggers, or OS-level compromise are out of scope for this document; the threat model focuses on in-browser and storage security.


## References

- [ARCHITECTURE.md](ARCHITECTURE.md) — Tech stack, data flow, workers, persistence.