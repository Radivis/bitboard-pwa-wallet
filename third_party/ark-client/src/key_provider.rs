use crate::error::Error;
use bitcoin::bip32::DerivationPath;
use bitcoin::bip32::Xpriv;
use bitcoin::key::Keypair;
use bitcoin::secp256k1::Secp256k1;
use std::sync::Arc;

/// Maps `Bip32KeyProvider::next_index` to the index shown for receive (mirrors BDK `last_reveal`).
pub fn display_receive_derivation_index(next_index: u32) -> u32 {
    if next_index > 0 {
        next_index - 1
    } else {
        0
    }
}

pub enum KeypairIndex {
    /// Increments the index and returns a new keypair
    New,
    /// Returns the last unused address
    LastUnused,
}

/// Provides keypairs for signing operations
///
/// This trait allows different key management strategies:
/// - Static keypair (single key)
/// - BIP32 HD wallet (hierarchical deterministic)
/// - Hardware wallets (future)
/// - Custom key derivation schemes
pub trait KeyProvider: Send + Sync {
    /// Get a keypair for receiving funds
    ///
    /// For static key providers, this always returns the same keypair regardless of the index.
    /// For HD wallets, behavior depends on the `keypair_index` parameter.
    ///
    /// # Arguments
    ///
    /// * `keypair_index` - Controls which keypair to return:
    ///   - `KeypairIndex::New`: Increments the internal index and returns a new keypair
    ///   - `KeypairIndex::LastUnused`: Returns the last unused keypair without incrementing
    ///
    /// # Returns
    ///
    /// A keypair to use for receiving funds
    fn get_next_keypair(&self, keypair_index: KeypairIndex) -> Result<Keypair, Error>;

    /// Get a keypair for a specific BIP32 derivation path
    ///
    /// # Arguments
    ///
    /// * `path` - BIP32 derivation path as an array of child indexes
    ///
    /// # Returns
    ///
    /// A keypair derived at the specified path, or an error if derivation is not supported
    fn get_keypair_for_path(&self, path: &[u32]) -> Result<Keypair, Error>;

    /// Get a keypair for a specific public key
    ///
    /// This is essential for HD wallets where you need to find the correct keypair
    /// for signing with a previously generated public key.
    ///
    /// # Arguments
    ///
    /// * `pk` - The X-only public key to find the keypair for
    ///
    /// # Returns
    ///
    /// The keypair corresponding to the public key, or an error if not found
    fn get_keypair_for_pk(&self, pk: &bitcoin::XOnlyPublicKey) -> Result<Keypair, Error>;

    /// Get all public keys that this provider currently knows about
    ///
    /// For static key providers, this returns the single keypair's public key.
    /// For HD wallets, this returns all public keys that have been derived and cached
    /// (i.e., keys generated via `get_next_keypair`).
    ///
    /// This is useful for determining which keys are available for signing operations
    /// without having to search or derive new keys.
    ///
    /// # Returns
    ///
    /// A vector of X-only public keys known to this provider
    fn get_cached_pks(&self) -> Result<Vec<bitcoin::XOnlyPublicKey>, Error>;

    /// Returns true if this provider supports key discovery
    ///
    /// HD wallets return true since they can derive and discover previously used keys.
    /// Static key providers return false (single key, nothing to discover).
    fn supports_discovery(&self) -> bool {
        false
    }

    /// Get the derivation index for a cached public key.
    ///
    /// Returns `None` if the provider doesn't support index-based derivation
    /// or if the key is not in the cache.
    fn get_derivation_index_for_pk(&self, _pk: &bitcoin::XOnlyPublicKey) -> Option<u32> {
        None
    }

    /// Derive a keypair at a specific index without caching
    ///
    /// This is used during discovery to check keys without affecting the provider's state.
    /// Returns `None` if the provider doesn't support index-based derivation.
    ///
    /// # Arguments
    ///
    /// * `index` - The derivation index (appended to base path for HD wallets)
    fn derive_at_discovery_index(&self, _index: u32) -> Result<Option<Keypair>, Error> {
        Ok(None)
    }

    /// Cache a discovered keypair at the given index
    ///
    /// This is called after discovery determines a key is "used" (has VTXOs).
    /// Also updates next_index if index >= current next_index to avoid collisions.
    ///
    /// No-op for providers that don't support discovery.
    ///
    /// # Arguments
    ///
    /// * `index` - The derivation index
    /// * `keypair` - The keypair to cache
    fn cache_discovered_keypair(&self, _index: u32, _keypair: Keypair) -> Result<(), Error> {
        Ok(())
    }

    fn mark_as_used(&self, _pk: &bitcoin::XOnlyPublicKey) -> Result<(), Error> {
        Ok(())
    }

    /// Next derivation index to assign on reveal (`KeypairIndex::New`).
    ///
    /// Default `Ok(None)` is for [`StaticKeyProvider`] (`OfflineClient::new_with_keypair`): one
    /// fixed keypair, no derivation cursor. [`Bip32KeyProvider`] overrides with `Some(next_index)`.
    /// Bitboard (`bitboard-ark`) always uses `new_with_bip32_at_index`, so callers there always
    /// see `Some` — the `None` branch exists for generic `Client<K: KeyProvider>` only.
    fn peek_next_derivation_index(&self) -> Result<Option<u32>, Error> {
        Ok(None)
    }

    /// Derive and cache a keypair at `index` without incrementing `next_index` or consulting `used`.
    fn ensure_keypair_cached_at_index(&self, _index: u32) -> Result<Keypair, Error> {
        Err(Error::ad_hoc(
            "index-based key caching is not supported by this key provider",
        ))
    }

    /// Locally derive and cache indices `0..up_to_exclusive` (no operator calls).
    fn warm_local_derivation_indices(&self, _up_to_exclusive: u32) -> Result<(), Error> {
        Ok(())
    }
}

/// A simple key provider that uses a static keypair
///
/// This is the simplest implementation and is backward compatible with
/// the original single-keypair design.
#[derive(Clone)]
pub struct StaticKeyProvider {
    keypair: Keypair,
}

impl StaticKeyProvider {
    /// Create a new static key provider
    pub fn new(keypair: Keypair) -> Self {
        Self { keypair }
    }
}

impl KeyProvider for StaticKeyProvider {
    fn get_next_keypair(&self, _: KeypairIndex) -> Result<Keypair, Error> {
        // Static provider always returns the same keypair
        Ok(self.keypair)
    }

    fn ensure_keypair_cached_at_index(&self, _index: u32) -> Result<Keypair, Error> {
        Ok(self.keypair)
    }

    fn get_keypair_for_path(&self, _path: &[u32]) -> Result<Keypair, Error> {
        // Static provider always returns the same keypair
        Ok(self.keypair)
    }

    fn get_keypair_for_pk(&self, pk: &bitcoin::XOnlyPublicKey) -> Result<Keypair, Error> {
        // Verify that the requested public key matches our keypair
        let stored_x_only_public_key = self.keypair.x_only_public_key().0;
        if &stored_x_only_public_key == pk {
            Ok(self.keypair)
        } else {
            Err(Error::ad_hoc(format!(
                "Public key mismatch: requested {pk}, but only have {stored_x_only_public_key}"
            )))
        }
    }

    fn get_cached_pks(&self) -> Result<Vec<bitcoin::XOnlyPublicKey>, Error> {
        Ok(vec![self.keypair.public_key().into()])
    }
}

/// A BIP32 hierarchical deterministic key provider
///
/// This provider derives keypairs from a master extended private key
/// using BIP32 derivation paths. It maintains an index counter for
/// generating new receiving addresses.
///
/// ## Example
///
/// ```rust
/// # use std::str::FromStr;
/// # use bitcoin::bip32::{Xpriv, DerivationPath};
/// # use bitcoin::Network;
/// # use crate::ark_client::KeyProvider;
/// # use ark_client::Bip32KeyProvider;
/// # use ark_client::key_provider::KeypairIndex;
///
/// fn example() -> Result<(), Box<dyn std::error::Error>> {
/// // Create from a master key with a base path (e.g., m/84'/0'/0'/0)
/// let master_key = Xpriv::from_str("xprv...")?;
/// let base_path = DerivationPath::from_str("m/84'/0'/0'/0")?;
///
/// // This will derive keys at m/84'/0'/0'/0/0, m/84'/0'/0'/0/1, etc.
/// let provider = Bip32KeyProvider::new(master_key, base_path);
///
/// // Get the next receiving keypair (increments index)
/// let kp1 = provider.get_next_keypair(KeypairIndex::New)?; // m/84'/0'/0'/0/0
/// let kp2 = provider.get_next_keypair(KeypairIndex::New)?; // m/84'/0'/0'/0/1
///
/// // Or derive a specific keypair by path
/// let custom_path = vec![84 + 0x8000_0000, 0x8000_0000, 0x8000_0000, 0, 5];
/// let keypair = provider.get_keypair_for_path(&custom_path)?;
/// # Ok(())
/// # }
/// ```
pub struct Bip32KeyProvider {
    master_key: Xpriv,
    base_path: DerivationPath,
    // Using std::sync::Mutex for interior mutability across Send + Sync
    next_index: Arc<std::sync::Mutex<u32>>,
    // Cache of derived keys: x-only public key -> (derivation_index, keypair, used)
    // The `used` flag indicates whether this keypair has been used (has VTXOs)
    key_cache:
        Arc<std::sync::RwLock<std::collections::HashMap<bitcoin::XOnlyPublicKey, KeyCacheValue>>>,
}

#[derive(Clone, Copy)]
pub struct KeyCacheValue {
    derivation_index: u32,
    keypair: Keypair,
    /// Indicates whether this keypair has been used (has VTXOs).
    used: bool,
}

impl Bip32KeyProvider {
    /// Create a new BIP32 key provider
    ///
    /// # Arguments
    ///
    /// * `master_key` - The master extended private key (xpriv)
    /// * `base_path` - The base derivation path (e.g., m/84'/0'/0'/0). The provider will append
    ///   index numbers to this path.
    pub fn new(master_key: Xpriv, base_path: DerivationPath) -> Self {
        Self {
            master_key,
            base_path,
            next_index: Arc::new(std::sync::Mutex::new(0)),
            key_cache: Arc::new(std::sync::RwLock::new(std::collections::HashMap::new())),
        }
    }

    /// Create a new BIP32 key provider starting from a specific index
    ///
    /// # Arguments
    ///
    /// * `master_key` - The master extended private key (xpriv)
    /// * `base_path` - The base derivation path
    /// * `start_index` - The starting index for key derivation
    pub fn new_with_index(master_key: Xpriv, base_path: DerivationPath, start_index: u32) -> Self {
        Self {
            master_key,
            base_path,
            next_index: Arc::new(std::sync::Mutex::new(start_index)),
            key_cache: Arc::new(std::sync::RwLock::new(std::collections::HashMap::new())),
        }
    }

    /// Derive a keypair at the specified path
    fn derive_keypair(&self, path: &DerivationPath) -> Result<Keypair, Error> {
        let secp = Secp256k1::new();
        let derived_key = self
            .master_key
            .derive_priv(&secp, path)
            .map_err(|e| Error::ad_hoc(format!("BIP32 derivation failed: {e}")))?;

        Ok(derived_key.to_keypair(&secp))
    }

    /// Derive a keypair at base_path/index
    fn derive_at_index(&self, index: u32) -> Result<Keypair, Error> {
        use bitcoin::bip32::ChildNumber;

        let path = self.base_path.clone();
        let path = path.extend([ChildNumber::Normal { index }]);

        self.derive_keypair(&path)
    }

    pub fn peek_next_derivation_index_value(&self) -> Result<u32, Error> {
        let next_derivation_index = self
            .next_index
            .lock()
            .map_err(|e| Error::ad_hoc(format!("Failed to lock next_index: {e}")))?;
        Ok(*next_derivation_index)
    }
}

impl KeyProvider for Bip32KeyProvider {
    fn get_next_keypair(&self, keypair_index: KeypairIndex) -> Result<Keypair, Error> {
        match keypair_index {
            KeypairIndex::New => {
                // Get and increment the next index
                let derivation_index = {
                    let mut next_derivation_index = self
                        .next_index
                        .lock()
                        .map_err(|e| Error::ad_hoc(format!("Failed to lock next_index: {e}")))?;
                    let assigned_derivation_index = *next_derivation_index;
                    *next_derivation_index = next_derivation_index
                        .checked_add(1)
                        .ok_or_else(|| Error::ad_hoc("Key derivation index overflow"))?;
                    assigned_derivation_index
                };

                // Derive the keypair at this index
                let keypair = self.derive_at_index(derivation_index)?;

                // Cache it for later lookup (marked as unused)
                let x_only_public_key = keypair.x_only_public_key().0;
                {
                    let mut cache = self
                        .key_cache
                        .write()
                        .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
                    cache.insert(
                        x_only_public_key,
                        KeyCacheValue {
                            derivation_index,
                            keypair,
                            used: false,
                        },
                    );
                }

                Ok(keypair)
            }
            KeypairIndex::LastUnused => {
                // First, try to find an unused keypair in the cache
                {
                    let cache = self
                        .key_cache
                        .read()
                        .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;

                    // Find the unused keypair with the lowest index
                    let lowest_unused_cache_entry = cache
                        .values()
                        .filter(|KeyCacheValue { used, .. }| !used)
                        .min_by_key(|KeyCacheValue { derivation_index, .. }| *derivation_index);

                    if let Some(KeyCacheValue { keypair, .. }) = lowest_unused_cache_entry {
                        return Ok(*keypair);
                    }
                }

                // No unused keypair found, derive a new one
                self.get_next_keypair(KeypairIndex::New)
            }
        }
    }

    fn get_keypair_for_path(&self, path: &[u32]) -> Result<Keypair, Error> {
        use bitcoin::bip32::ChildNumber;
        let child_numbers: Vec<ChildNumber> = path
            .iter()
            .map(|&n| {
                if n & 0x8000_0000 != 0 {
                    ChildNumber::Hardened {
                        index: n & 0x7FFF_FFFF,
                    }
                } else {
                    ChildNumber::Normal { index: n }
                }
            })
            .collect();
        let derivation_path = DerivationPath::from(child_numbers);
        self.derive_keypair(&derivation_path)
    }

    fn get_keypair_for_pk(&self, pk: &bitcoin::XOnlyPublicKey) -> Result<Keypair, Error> {
        // First check the cache
        {
            let cache = self
                .key_cache
                .read()
                .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
            if let Some(KeyCacheValue { keypair, .. }) = cache.get(pk) {
                return Ok(*keypair);
            }
        }

        // If not in cache, search indices below the next derivation index.
        let next_derivation_index = {
            let next_derivation_index_guard = self
                .next_index
                .lock()
                .map_err(|e| Error::ad_hoc(format!("Failed to lock next_index: {e}")))?;
            *next_derivation_index_guard
        };

        // Search through derived keys up to next_derivation_index (exclusive).
        for derivation_index in 0..next_derivation_index {
            let keypair = self.derive_at_index(derivation_index)?;
            let derived_x_only_public_key = keypair.x_only_public_key().0;

            if &derived_x_only_public_key == pk {
                // Cache it for next time (assume used since we're looking it up for signing)
                let mut cache = self
                    .key_cache
                    .write()
                    .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
                cache.insert(
                    derived_x_only_public_key,
                    KeyCacheValue {
                        derivation_index,
                        keypair,
                        used: true,
                    },
                );
                return Ok(keypair);
            }
        }

        Err(Error::ad_hoc(format!(
            "Public key {pk} not found in HD wallet. \
            Searched indices 0..{next_derivation_index}. \
            The key may have been generated outside this provider."
        )))
    }

    fn get_cached_pks(&self) -> Result<Vec<bitcoin::XOnlyPublicKey>, Error> {
        let cache = self
            .key_cache
            .read()
            .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;

        Ok(cache.keys().copied().collect())
    }

    fn supports_discovery(&self) -> bool {
        true
    }

    fn get_derivation_index_for_pk(&self, pk: &bitcoin::XOnlyPublicKey) -> Option<u32> {
        let cache = self.key_cache.read().ok()?;
        cache
            .get(pk)
            .map(|cache_entry| cache_entry.derivation_index)
    }

    fn derive_at_discovery_index(&self, index: u32) -> Result<Option<Keypair>, Error> {
        self.derive_at_index(index).map(Some)
    }

    fn cache_discovered_keypair(&self, index: u32, keypair: Keypair) -> Result<(), Error> {
        let x_only_public_key = keypair.x_only_public_key().0;

        // Add to cache (marked as used since it was discovered with VTXOs)
        {
            let mut cache = self
                .key_cache
                .write()
                .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
            cache.insert(
                x_only_public_key,
                KeyCacheValue {
                    derivation_index: index,
                    keypair,
                    used: true,
                },
            );
        }

        // Update next_index if needed (set to index + 1 if >= current)
        {
            let mut next_derivation_index = self
                .next_index
                .lock()
                .map_err(|e| Error::ad_hoc(format!("Failed to lock next_index: {e}")))?;
            if index >= *next_derivation_index {
                *next_derivation_index = index
                    .checked_add(1)
                    .ok_or_else(|| Error::ad_hoc("Key derivation index overflow"))?;
            }
        }

        Ok(())
    }

    fn mark_as_used(&self, pk: &bitcoin::XOnlyPublicKey) -> Result<(), Error> {
        // First check the cache
        {
            let cached_entry = {
                let cache = self
                    .key_cache
                    .read()
                    .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
                cache.get(pk).copied()
            };

            match cached_entry {
                Some(KeyCacheValue {
                    derivation_index,
                    keypair,
                    used: false,
                }) => {
                    let mut cache = self
                        .key_cache
                        .write()
                        .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
                    cache.insert(
                        *pk,
                        KeyCacheValue {
                            derivation_index,
                            keypair,
                            used: true,
                        },
                    );
                    return Ok(());
                }
                Some(KeyCacheValue { used: true, .. }) => {
                    // already marked as used
                    return Ok(());
                }
                None => {}
            }
        }

        // If not in cache, search indices below the next derivation index.
        let next_derivation_index = {
            let next_derivation_index_guard = self
                .next_index
                .lock()
                .map_err(|e| Error::ad_hoc(format!("Failed to lock next_index: {e}")))?;
            *next_derivation_index_guard
        };

        // Search through derived keys up to next_derivation_index (exclusive).
        for derivation_index in 0..next_derivation_index {
            let keypair = self.derive_at_index(derivation_index)?;
            let derived_x_only_public_key = keypair.x_only_public_key().0;

            if &derived_x_only_public_key == pk {
                let mut cache = self
                    .key_cache
                    .write()
                    .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
                cache.insert(
                    derived_x_only_public_key,
                    KeyCacheValue {
                        derivation_index,
                        keypair,
                        used: true,
                    },
                );
                return Ok(());
            }
        }

        Err(Error::ad_hoc(format!(
            "Public key {pk} not found in HD wallet. \
            Searched indices 0..{next_derivation_index}. \
            The key may have been generated outside this provider."
        )))
    }

    fn peek_next_derivation_index(&self) -> Result<Option<u32>, Error> {
        Ok(Some(self.peek_next_derivation_index_value()?))
    }

    fn ensure_keypair_cached_at_index(&self, index: u32) -> Result<Keypair, Error> {
        {
            let cache = self
                .key_cache
                .read()
                .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
            if let Some(KeyCacheValue { keypair, .. }) = cache
                .values()
                .find(|KeyCacheValue { derivation_index, .. }| *derivation_index == index)
            {
                return Ok(*keypair);
            }
        }

        let keypair = self.derive_at_index(index)?;
        let x_only_public_key = keypair.x_only_public_key().0;
        {
            let mut cache = self
                .key_cache
                .write()
                .map_err(|e| Error::ad_hoc(format!("Failed to lock key_cache: {e}")))?;
            cache
                .entry(x_only_public_key)
                .or_insert(KeyCacheValue {
                    derivation_index: index,
                    keypair,
                    used: false,
                });
        }
        Ok(keypair)
    }

    fn warm_local_derivation_indices(&self, up_to_exclusive: u32) -> Result<(), Error> {
        for index in 0..up_to_exclusive {
            self.ensure_keypair_cached_at_index(index)?;
        }
        Ok(())
    }
}

// Implement KeyProvider for Arc<T> where T: KeyProvider
impl<T: KeyProvider> KeyProvider for Arc<T> {
    fn get_next_keypair(&self, keypair_index: KeypairIndex) -> Result<Keypair, Error> {
        (**self).get_next_keypair(keypair_index)
    }

    fn get_keypair_for_path(&self, path: &[u32]) -> Result<Keypair, Error> {
        (**self).get_keypair_for_path(path)
    }

    fn get_keypair_for_pk(&self, pk: &bitcoin::XOnlyPublicKey) -> Result<Keypair, Error> {
        (**self).get_keypair_for_pk(pk)
    }

    fn get_cached_pks(&self) -> Result<Vec<bitcoin::XOnlyPublicKey>, Error> {
        (**self).get_cached_pks()
    }

    fn supports_discovery(&self) -> bool {
        (**self).supports_discovery()
    }

    fn get_derivation_index_for_pk(&self, pk: &bitcoin::XOnlyPublicKey) -> Option<u32> {
        (**self).get_derivation_index_for_pk(pk)
    }

    fn derive_at_discovery_index(&self, index: u32) -> Result<Option<Keypair>, Error> {
        (**self).derive_at_discovery_index(index)
    }

    fn cache_discovered_keypair(&self, index: u32, keypair: Keypair) -> Result<(), Error> {
        (**self).cache_discovered_keypair(index, keypair)
    }

    fn mark_as_used(&self, pk: &bitcoin::XOnlyPublicKey) -> Result<(), Error> {
        (**self).mark_as_used(pk)
    }

    fn peek_next_derivation_index(&self) -> Result<Option<u32>, Error> {
        (**self).peek_next_derivation_index()
    }

    fn ensure_keypair_cached_at_index(&self, index: u32) -> Result<Keypair, Error> {
        (**self).ensure_keypair_cached_at_index(index)
    }

    fn warm_local_derivation_indices(&self, up_to_exclusive: u32) -> Result<(), Error> {
        (**self).warm_local_derivation_indices(up_to_exclusive)
    }
}
