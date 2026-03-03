# bdk_wallet version 2.x API documentation
_Exported on 3/3/2026 at 17:28:28 GMT+1 from Cursor (2.5.26)_

---

**User**

Search the web for the latest documentation and API of `bdk_wallet` version 2.x (the Bitcoin Dev Kit wallet crate for Rust). I need to understand:

1. How to create a wallet from descriptors (the `Wallet::create` or `Wallet::new` API)
2. How to load a wallet from a persisted ChangeSet (the `Wallet::load` API)
3. How `ChangeSet` serialization works (does it implement Serialize/Deserialize?)
4. How to get an address from the wallet (peek vs reveal)
5. How to get the balance
6. How the wallet interacts with `bdk_esplora` for syncing
7. The wallet handle lifetime / ownership model

Look at docs.rs/bdk_wallet and any recent examples or changelogs. Report back with concrete API signatures and usage patterns.

---

**Cursor**


# bdk_wallet 2.x API Summary

Summary of the **bdk_wallet 2.3.0** API (docs.rs and Book of BDK).

---

## 1. Creating a wallet from descriptors

**`Wallet::create`** (recommended):

```rust
pub fn create<D>(descriptor: D, change_descriptor: D) -> CreateParams
where D: IntoWalletDescriptor + Send + Clone + 'static
```

Returns `CreateParams` for further configuration. Examples:

```rust
// Non-persisted (in-memory)
let wallet = Wallet::create(EXTERNAL_DESC, INTERNAL_DESC)
    .network(Network::Testnet)
    .create_wallet_no_persist()?;

// Persisted (e.g. SQLite)
let mut conn = Connection::open(file_path)?;
let wallet = Wallet::create(EXTERNAL_DESC, INTERNAL_DESC)
    .network(Network::Testnet)
    .create_wallet(&mut conn)?;
```

**`Wallet::create_single`** – single descriptor (no change keychain):

```rust
pub fn create_single<D>(descriptor: D) -> CreateParams
where D: IntoWalletDescriptor + Send + Clone + 'static
```

**`Wallet::create_from_two_path_descriptor`** – multipath descriptor (BIP 389):

```rust
pub fn create_from_two_path_descriptor<D>(two_path_descriptor: D) -> CreateParams
where D: IntoWalletDescriptor + Send + Clone + 'static
```

---

## 2. Loading a wallet from persisted ChangeSet

**`Wallet::load`** – builder for loading:

```rust
pub fn load() -> LoadParams
```

**Load from persistence (e.g. SQLite):**

```rust
let mut conn = Connection::open(file_path)?;
let wallet_opt = Wallet::load()
    .descriptor(KeychainKind::External, Some(EXTERNAL_DESC))
    .descriptor(KeychainKind::Internal, Some(INTERNAL_DESC))
    .extract_keys()
    .check_network(network)
    .load_wallet(&mut conn)?
    .expect("wallet");
```

**Load from in-memory ChangeSet (no persistence):**

```rust
let wallet = Wallet::load()
    .load_wallet_no_persist(changeset)?
    .expect("must have data to load wallet");
```

**Direct load from ChangeSet:**

```rust
pub fn load_with_params(
    changeset: ChangeSet,
    params: LoadParams,
) -> Result<Option<Self>, LoadError>
```

Returns `Ok(None)` if the changeset is empty.

---

## 3. ChangeSet serialization

`ChangeSet` implements `Serialize` and `Deserialize`:

- `impl Serialize for ChangeSet`
- `impl<'de> Deserialize<'de> for ChangeSet`

It also implements:

- `Default`
- `Merge` (for combining multiple changesets)

Structure:

```rust
pub struct ChangeSet {
    pub descriptor: Option<Descriptor<DescriptorPublicKey>>,
    pub change_descriptor: Option<Descriptor<DescriptorPublicKey>>,
    pub network: Option<Network>,
    pub local_chain: ChangeSet,
    pub tx_graph: ChangeSet<ConfirmationBlockTime>,
    pub indexer: ChangeSet,
}
```

You can use `serde_json` or any Serde backend. `bdk_file_store` uses a flat file; SQLite uses `ChangeSet::from_sqlite` / `persist_to_sqlite`.

---

## 4. Addresses: peek vs reveal

**`peek_address`** – read-only, does not change state:

```rust
pub fn peek_address(&self, keychain: KeychainKind, index: u32) -> AddressInfo
```

Returns the address at `index` without advancing derivation. For non-wildcard descriptors, the same address is returned for any index.

**`reveal_next_address`** – mutates wallet, advances index:

```rust
pub fn reveal_next_address(&mut self, keychain: KeychainKind) -> AddressInfo
```

Returns the next address and increments the derivation index. You must persist the resulting changes before closing the wallet to avoid address reuse.

**`next_unused_address`** – next address that has not been used in a transaction:

```rust
pub fn next_unused_address(&mut self, keychain: KeychainKind) -> AddressInfo
```

May reveal a new address if all revealed addresses are used.

---

## 5. Balance

```rust
pub fn balance(&self) -> Balance
```

`Balance` fields:

```rust
pub struct Balance {
    pub immature: Amount,
    pub trusted_pending: Amount,
    pub untrusted_pending: Amount,
    pub confirmed: Amount,
}
```

Helpers:

- `balance.total()` – total visible balance
- `balance.trusted_spendable()` – `trusted_pending + confirmed` (spendable without double-spend risk)

---

## 6. Wallet + bdk_esplora sync

Flow:

1. Build a sync request from the wallet.
2. Call Esplora with that request.
3. Apply the response to the wallet.

**Partial sync (revealed SPKs only):**

```rust
use bdk_esplora::EsploraExt;

let sync_request = wallet.start_sync_with_revealed_spks();
let sync_response = client.sync(sync_request, PARALLEL_REQUESTS)?;
wallet.apply_update(sync_response)?;
```

**Full scan (e.g. restore):**

```rust
let full_scan_request = wallet.start_full_scan();
let full_scan_response = client.full_scan(full_scan_request, STOP_GAP, PARALLEL_REQUESTS)?;
wallet.apply_update(full_scan_response)?;
```

`EsploraExt`:

```rust
fn sync<I: 'static, R: Into<SyncRequest<I>>>(
    &self,
    request: R,
    parallel_requests: usize,
) -> Result<SyncResponse, Error>;

fn full_scan<K: Ord + Clone, R: Into<FullScanRequest<K>>>(
    &self,
    request: R,
    stop_gap: usize,
    parallel_requests: usize,
) -> Result<FullScanResponse<K>, Error>;
```

`SyncResponse` and `FullScanResponse` implement `Into<Update>`, so they can be passed to `wallet.apply_update(...)`.

---

## 7. Wallet handle lifetime / ownership

**`Wallet`** – owned struct; you hold it directly.

**`PersistedWallet<P>`** – wrapper around `Wallet` that:

- Enforces persistence checks
- Derefs to `Wallet` (`Deref` / `DerefMut`)
- Is parameterized by persister type `P`

**Persistence contract (`WalletPersister`):**

```rust
pub trait WalletPersister {
    type Error;
    fn initialize(persister: &mut Self) -> Result<ChangeSet, Self::Error>;
    fn persist(persister: &mut Self, changeset: &ChangeSet) -> Result<(), Self::Error>;
}
```

**Staging model:**

- Mutating operations (e.g. `reveal_next_address`, `apply_update`) stage changes.
- You call `wallet.take_staged()` to get the `ChangeSet`.
- You persist that `ChangeSet` via your `WalletPersister`.
- `PersistedWallet::persist(&mut self, persister)` does this for you.

**Ownership:**

- `Wallet` and `PersistedWallet<P>` are owned; no `Arc` or shared handles.
- The wallet is not tied to the persister’s lifetime; you pass `&mut P` when persisting.
- For concurrent access you would need your own synchronization (e.g. `Mutex<Wallet>`).

---

## References

- [bdk_wallet docs.rs](https://docs.rs/bdk_wallet/latest/bdk_wallet/)
- [bdk_esplora docs.rs](https://docs.rs/bdk_esplora/latest/bdk_esplora/)
- [Book of BDK – Sync with Esplora](https://bookofbdk.com/cookbook/syncing/esplora/)

