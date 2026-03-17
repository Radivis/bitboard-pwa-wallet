# Security

This document describes how Bitboard Wallet keeps user credentials and wallet secrets safe, and states inherent limitations of the web / PWA environment. It complements [ARCHITECTURE.md](ARCHITECTURE.md) and the Phase 4 security review.

---

## 1. Threat model

**Scope:** Local PWA, no backend. All assets and API calls go to Esplora (or a dev proxy). There are no server-side secrets.

- **In scope:** Browser storage (SQLite/OPFS, settings), worker and main-thread handling of passwords/mnemonics/keys, Esplora URLs and validation, input validation (addresses, amounts, descriptors, URLs), dependency advisories.
- **Out of scope:** Physical access, OS-level attacks, and full penetration testing (per project review policy).

Findings and mitigations below are interpreted in this context.

---

## 2. Security measures

### 2.1 Sensitive data: creation, storage, and clearing

**Where secrets are created**

- **Mnemonic:** Generated only in the **crypto worker** via WASM (`generate_mnemonic`). It is never sent to the main thread except when intentionally shown to the user (create backup step, seed phrase backup).
- **Password:** Comes only from user input. It is held in the **session store** (`password: string | null`) and used when unlocking, syncing, or updating wallet state.
- **Derived keys:** Created only inside the **encryption worker**: Argon2id (WASM) then Web Crypto `importKey` for AES-GCM. Used only for encrypt/decrypt; the raw key buffer is zeroed with `fill(0)` after `importKey`. A comment in code notes that Web Crypto may retain internal copies of the key.

**Worker-to-worker secrets channel**

- The main thread never sees decrypted wallet secrets (mnemonic, `WalletSecrets` JSON). A **MessageChannel** connects the encryption worker and the crypto worker; the main thread creates the channel and passes one port to each worker (using Comlink `transfer()` so ports are transferred, not cloned). It never reads from that channel.
- Decrypt/encrypt for “resolve descriptor wallet” and “update changeset” run via this channel: crypto worker requests decrypt/encrypt from the encryption worker over the port; plaintext secrets stay in the workers. The main thread never sees decrypted wallet secrets: it only passes encrypted blobs between the crypto worker and the app’s DB layer. DB operations are initiated from the main thread via Kysely; the actual SQLite/OPFS access is performed by the WaSqlite worker (Kysely’s `WaSqliteWorkerDialect`), not the main thread.
- The channel is established by `ensureSecretsChannel()` before any operation that needs it. When the user manually locks the wallet, the crypto worker is terminated and `resetSecretsChannel()` is called so that the next unlock re-establishes the channel for a new worker.

**Storage**

- **Encrypted at rest:** The `wallet_secrets` table holds `encrypted_data`, `iv`, and `salt` per wallet (and per save). Encryption: **Argon2id** (64 MB memory, 2 iterations, parallelism 1, 32-byte key) + **AES-256-GCM**. Salt and IV are unique per encryption. See [ARCHITECTURE.md](ARCHITECTURE.md) and the encryption worker for details.
- **Unencrypted:** The `wallets` table (ids, names) and `settings` (e.g. custom Esplora URLs). No passwords or mnemonics are stored in settings.

**Clearing and lock**

- **Session:** `sessionStore.clear()` sets `password: null`. It does **not** overwrite the previous string in memory (see limitations below).
- **Lock:** From Settings, “Lock Wallet” calls `lockWallet()`, terminates the crypto worker, resets the secrets channel, clears the session, and clears the auto-lock timer. No password or mnemonic is stored in URL, `localStorage`, or `sessionStorage`.

### 2.2 Storage and persistence

- **Backend:** SQLite via WaSqlite with OPFS; single DB file. Schema: `wallets`, `settings`, `wallet_secrets` (see [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Encryption algorithm:** Argon2id (parameters above) + AES-256-GCM; 16-byte random salt, 12-byte random IV per encryption. Implemented in the encryption worker and `bitboard_encryption` WASM.

### 2.3 External communication

- **Esplora:** Used only for chain data and transaction broadcast. Default and custom Esplora URLs are validated with `validateEsploraUrl`; non-regtest/non-lab require HTTPS. No secrets are sent to Esplora; no logging of URLs that could carry sensitive query parameters.

### 2.4 Input and validation

- **Addresses:** Frontend uses `isValidAddress` (prefix check); crypto uses full parsing and network checks.
- **Amounts:** `parseBTC` converts user input to satoshis; it returns 0 for NaN, negative, or non-finite input and clamps to `Number.MAX_SAFE_INTEGER` to avoid overflow. Send flow enforces positive amount and balance checks; WASM rejects zero amounts.
- **Descriptors:** Loaded from encrypted storage or produced by WASM; not user-typed. WASM boundary uses strings/serializable data only; no raw buffer pointers exposed.

### 2.5 Dependencies and audits

- **Rust:** `cargo deny check advisories` runs in CI (see `.github/workflows/audit.yml`).
- **Frontend:** Same workflow runs Socket CLI for npm when the API key is set; Socket is optional. Lefthook audit steps may be commented out; consider `npm audit` for local pre-push checks.

### 2.6 Logging

- Production code does not log passwords, mnemonics, or key material. Worker init and health checks log only non-sensitive messages. Dev/test components (e.g. CryptoTest) that can display a mnemonic must not be included in production builds or must be behind a dev-only route.

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

---

## 4. Recommended follow-ups

- **Audit docs:** Document that Socket is optional when the secret is not set; consider enabling or replacing with `npm audit` in lefthook for local checks.
- **CryptoTest / build:** Ensure dev/test components that display a mnemonic are excluded from production or behind a dev route.
- **Ongoing:** Keep dependencies and advisories (cargo deny, npm/Socket or npm audit) up to date and documented.

---

## 5. References

- [ARCHITECTURE.md](ARCHITECTURE.md) — Tech stack, data flow, workers, persistence.
- Phase 4 security review (`.cursor/pr-reviews/SECURITY-REVIEW-PHASE4.md`) — Detailed findings and follow-ups.
- Phase 4 security review plan (`.cursor/plans/phase_4_security_review_53efa358.plan.md`) — Threat model, sensitive data handling, mnemonic isolation design.
