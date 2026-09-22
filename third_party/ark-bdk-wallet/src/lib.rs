use anyhow::Result;
use ark_client::error::Error;
use ark_client::error::ErrorContext;
use ark_client::wallet::Balance;
use ark_client::wallet::BoardingWallet;
use ark_client::wallet::OnchainWallet;
use ark_client::wallet::Persistence;
use ark_core::BoardingOutput;
use ark_core::SelectedUtxo;
use ark_core::UtxoCoinSelection;
use bdk_esplora::EsploraAsyncExt;
use bdk_wallet::chain::Merge;
use bdk_wallet::ChangeSet;
use bdk_wallet::KeychainKind;
use bdk_wallet::SignOptions;
use bdk_wallet::TxOrdering;
use bdk_wallet::Wallet as BdkWallet;
use bitcoin::bip32::Xpriv;
use bitcoin::key::Keypair;
use bitcoin::key::Secp256k1;
use bitcoin::secp256k1::schnorr::Signature;
use bitcoin::secp256k1::All;
use bitcoin::secp256k1::Message;
use bitcoin::Address;
use bitcoin::Amount;
use bitcoin::FeeRate;
use bitcoin::Network;
use bitcoin::Psbt;
use bitcoin::XOnlyPublicKey;
use jiff::Timestamp;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::sync::RwLock;

#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
mod utils;

pub struct Wallet<DB>
where
    DB: Persistence,
{
    kp: Keypair,
    secp: Secp256k1<All>,
    inner: Arc<RwLock<BdkWallet>>,
    #[cfg(not(all(target_arch = "wasm32", target_os = "unknown")))]
    client: esplora_client::AsyncClient,
    #[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
    client: esplora_client::AsyncClient<WebSleeper>,
    db: DB,
    completed_full_scan: AtomicBool,
    accumulated_changeset: RwLock<ChangeSet>,
}

impl<DB> Wallet<DB>
where
    DB: Persistence,
{
    pub fn new(
        kp: Keypair,
        secp: Secp256k1<All>,
        network: Network,
        esplora_url: &str,
        db: DB,
    ) -> Result<Self> {
        let key = kp.secret_key();
        let xprv = Xpriv::new_master(network, key.as_ref())?;
        Self::new_from_xpriv(xprv, secp, network, esplora_url, db)
    }

    /// Create a new wallet from a BIP32 extended private key.
    ///
    /// This avoids the double-derivation that occurs when using [`Self::new`] with a keypair
    /// derived from an existing Xpriv. Use this when you already have an Xpriv (e.g. from a
    /// BIP39 mnemonic).
    pub fn new_from_xpriv(
        xprv: Xpriv,
        secp: Secp256k1<All>,
        network: Network,
        esplora_url: &str,
        db: DB,
    ) -> Result<Self> {
        Self::new_from_xpriv_hydrated(xprv, secp, network, esplora_url, db, None, false)
    }

    /// Create or hydrate a BIP84 bumper wallet from a persisted SegWit-0 changeset.
    pub fn new_from_xpriv_hydrated(
        xprv: Xpriv,
        secp: Secp256k1<All>,
        network: Network,
        esplora_url: &str,
        db: DB,
        changeset_json: Option<&str>,
        full_scan_done: bool,
    ) -> Result<Self> {
        let kp = xprv.to_keypair(&secp);
        let (mut wallet, used_empty) = create_or_load_bip84_wallet(xprv, network, changeset_json)?;
        let accumulated = if used_empty {
            wallet.take_staged().unwrap_or_default()
        } else {
            changeset_json
                .and_then(|json| serde_json::from_str(json).ok())
                .unwrap_or_else(|| wallet.take_staged().unwrap_or_default())
        };

        #[cfg(not(all(target_arch = "wasm32", target_os = "unknown")))]
        let client = esplora_client::Builder::new(esplora_url).build_async_with_sleeper()?;

        #[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
        let client =
            esplora_client::Builder::new(esplora_url).build_async_with_sleeper::<WebSleeper>()?;

        Ok(Self {
            kp,
            secp,
            inner: Arc::new(RwLock::new(wallet)),
            client,
            db,
            completed_full_scan: AtomicBool::new(completed_full_scan_from_hydrate(
                full_scan_done,
                used_empty,
            )),
            accumulated_changeset: RwLock::new(accumulated),
        })
    }

    pub fn export_changeset_json(&self) -> Result<String, Error> {
        let mut wallet = self
            .inner
            .write()
            .map_err(|e| Error::consumer(format!("failed to get write lock: {e}")))?;
        let mut accumulated = self
            .accumulated_changeset
            .write()
            .map_err(|e| Error::consumer(format!("failed to get changeset write lock: {e}")))?;
        if let Some(staged) = wallet.take_staged() {
            accumulated.merge(staged);
        }
        serde_json::to_string(&*accumulated)
            .map_err(|e| Error::wallet(format!("serialize bumper changeset: {e}")))
    }

    pub fn completed_full_scan(&self) -> bool {
        self.completed_full_scan.load(Ordering::Acquire)
    }

    fn scan_unix_secs() -> Result<u64, Error> {
        let now: std::time::Duration = Timestamp::now()
            .as_duration()
            .try_into()
            .map_err(Error::wallet)?;
        Ok(now.as_secs())
    }

    async fn incremental_esplora_update(&self, now_secs: u64) -> Result<bdk_wallet::Update, Error> {
        let request = self
            .inner
            .read()
            .map_err(|e| Error::consumer(format!("failed to get read lock: {e}")))?
            .start_sync_with_revealed_spks_at(now_secs);
        self.client
            .sync(request, BUMPER_ESPLORA_PARALLEL_REQUESTS)
            .await
            .map_err(Error::wallet)
            .context("Failed syncing wallet")
            .map(Into::into)
    }

    async fn full_esplora_update(&self, now_secs: u64) -> Result<bdk_wallet::Update, Error> {
        let request = self
            .inner
            .read()
            .map_err(|e| Error::consumer(format!("failed to get read lock: {e}")))?
            .start_full_scan_at(now_secs);
        self.client
            .full_scan(
                request,
                BUMPER_FULL_SCAN_STOP_GAP,
                BUMPER_ESPLORA_PARALLEL_REQUESTS,
            )
            .await
            .map_err(Error::wallet)
            .context("Failed syncing wallet")
            .map(Into::into)
    }

    async fn fetch_esplora_update(&self) -> Result<(bdk_wallet::Update, bool), Error> {
        let now_secs = Self::scan_unix_secs()?;
        match onchain_wallet_scan_kind(self.completed_full_scan.load(Ordering::Acquire)) {
            OnchainWalletScanKind::Incremental => {
                Ok((self.incremental_esplora_update(now_secs).await?, false))
            }
            OnchainWalletScanKind::Full => Ok((self.full_esplora_update(now_secs).await?, true)),
        }
    }
}

impl<DB> OnchainWallet for Wallet<DB>
where
    DB: Persistence + Send + Sync,
{
    fn get_onchain_address(&self) -> Result<Address, Error> {
        let info = self
            .inner
            .write()
            .map_err(|e| Error::consumer(format!("failed to get write lock: {e}")))?
            .next_unused_address(KeychainKind::External);

        Ok(info.address)
    }

    async fn sync(&self) -> Result<(), Error> {
        let (update, mark_full_scan_done) = self.fetch_esplora_update().await?;
        self.inner
            .write()
            .expect("write lock")
            .apply_update(update)
            .map_err(Error::wallet)?;
        if mark_full_scan_done {
            self.completed_full_scan.store(true, Ordering::Release);
        }
        Ok(())
    }

    fn balance(&self) -> Result<Balance, Error> {
        let balance = self
            .inner
            .read()
            .map_err(|e| Error::consumer(format!("failed to get read lock: {e}")))?
            .balance();

        Ok(Balance {
            immature: balance.immature,
            trusted_pending: balance.trusted_pending,
            untrusted_pending: balance.untrusted_pending,
            confirmed: balance.confirmed,
        })
    }

    fn prepare_send_to_address(
        &self,
        address: Address,
        amount: Amount,
        fee_rate: FeeRate,
    ) -> Result<Psbt, Error> {
        let wallet = &mut self
            .inner
            .write()
            .map_err(|e| Error::consumer(format!("failed to get write lock: {e}")))?;
        let mut b = wallet.build_tx();
        b.ordering(TxOrdering::Untouched);
        b.add_recipient(address.script_pubkey(), amount);
        b.fee_rate(fee_rate);

        let psbt = b.finish().map_err(Error::wallet)?;

        Ok(psbt)
    }

    #[allow(deprecated)] // SignOptions deprecated in BDK 2.x; required until bitcoin::psbt migration.
    fn sign(&self, psbt: &mut Psbt) -> Result<bool, Error> {
        let options = SignOptions {
            trust_witness_utxo: true,
            ..SignOptions::default()
        };

        let finalized = self
            .inner
            .read()
            .map_err(|e| Error::consumer(format!("failed to get read lock: {e}")))?
            .sign(psbt, options)
            .map_err(Error::wallet)?;

        Ok(finalized)
    }

    fn select_coins(&self, target_amount: Amount) -> Result<UtxoCoinSelection, Error> {
        let wallet = self
            .inner
            .read()
            .map_err(|e| Error::consumer(format!("failed to get read lock: {e}")))?;

        // CPFP bumpers go into submitpackage with the unroll parent. An unconfirmed
        // fee-coin parent is not in that package, so bitcoind returns
        // package-not-child-with-unconfirmed-parents. Only spend confirmed UTXOs.
        let utxos = wallet.list_unspent();

        let mut selected_utxos = Vec::new();
        let mut total_selected = Amount::ZERO;
        let mut skipped_unconfirmed = 0u32;

        for utxo in utxos {
            if total_selected >= target_amount {
                break;
            }
            if !utxo.chain_position.is_confirmed() {
                skipped_unconfirmed += 1;
                continue;
            }

            let address = wallet
                .peek_address(utxo.keychain, utxo.derivation_index)
                .address;

            selected_utxos.push(SelectedUtxo {
                outpoint: utxo.outpoint,
                amount: utxo.txout.value,
                address,
            });

            total_selected += utxo.txout.value;
        }

        if total_selected < target_amount {
            return Err(Error::wallet(format!(
                "Insufficient confirmed funds: need {target_amount}, have {total_selected} \
                 (skipped {skipped_unconfirmed} unconfirmed UTXOs)"
            )));
        }

        let change_amount = total_selected - target_amount;

        Ok(UtxoCoinSelection {
            selected_utxos,
            total_selected,
            change_amount,
        })
    }
}

impl<DB> BoardingWallet for Wallet<DB>
where
    DB: Persistence,
{
    fn new_boarding_output(
        &self,
        server_pk: XOnlyPublicKey,
        exit_delay: bitcoin::Sequence,
        network: Network,
    ) -> Result<BoardingOutput, Error> {
        let sk = self.kp.secret_key();
        let (owner_pk, _) = sk.public_key(&self.secp).x_only_public_key();

        let boarding_output =
            BoardingOutput::new(&self.secp, server_pk, owner_pk, exit_delay, network)?;

        self.db
            .save_boarding_output(sk, boarding_output.clone())
            .context("Failed saving boarding output")?;

        Ok(boarding_output)
    }

    fn get_boarding_outputs(&self) -> Result<Vec<BoardingOutput>, Error> {
        self.db.load_boarding_outputs()
    }

    fn sign_for_pk(&self, pk: &XOnlyPublicKey, msg: &Message) -> Result<Signature, Error> {
        let key = self
            .db
            .sk_for_pk(pk)
            .with_context(|| format!("Failed retrieving SK for PK {pk}"))?;

        let sig = self
            .secp
            .sign_schnorr_no_aux_rand(msg, &key.keypair(&self.secp));

        Ok(sig)
    }
}

#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
#[derive(Clone)]
struct WebSleeper;

#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
impl esplora_client::Sleeper for WebSleeper {
    type Sleep = utils::SendWrapper<gloo_timers::future::TimeoutFuture>;

    fn sleep(dur: std::time::Duration) -> Self::Sleep {
        utils::SendWrapper(gloo_timers::future::sleep(dur))
    }
}

const BUMPER_FULL_SCAN_STOP_GAP: usize = 5;
const BUMPER_ESPLORA_PARALLEL_REQUESTS: usize = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum OnchainWalletScanKind {
    Full,
    Incremental,
}

/// After the first successful full scan in this process, later `sync()` calls must not
/// walk unused HD gap via `/scripthash/.../txs`.
pub(crate) fn onchain_wallet_scan_kind(completed_full_scan: bool) -> OnchainWalletScanKind {
    if completed_full_scan {
        OnchainWalletScanKind::Incremental
    } else {
        OnchainWalletScanKind::Full
    }
}

/// Treat the bumper as already full-scanned only when hydrate loaded a changeset
/// and that row's `fullScanDone` is set. An empty fallback must full-scan.
pub(crate) fn completed_full_scan_from_hydrate(full_scan_done: bool, used_empty: bool) -> bool {
    full_scan_done && !used_empty
}

/// Align bumper BDK chain with crypto (`Testnet` → Testnet4).
pub(crate) fn bumper_bdk_network(network: Network) -> Network {
    match network {
        Network::Testnet => Network::Testnet4,
        Network::Bitcoin | Network::Testnet4 | Network::Signet | Network::Regtest => network,
    }
}

fn try_load_bip84_from_changeset(
    xprv: Xpriv,
    bdk_network: Network,
    changeset_json: &str,
) -> Option<BdkWallet> {
    let changeset: ChangeSet = serde_json::from_str(changeset_json).ok()?;
    let external = bdk_wallet::template::Bip84(xprv, KeychainKind::External);
    let change = bdk_wallet::template::Bip84(xprv, KeychainKind::Internal);
    BdkWallet::load()
        .descriptor(KeychainKind::External, Some(external))
        .descriptor(KeychainKind::Internal, Some(change))
        .extract_keys()
        .check_network(bdk_network)
        .load_wallet_no_persist(changeset)
        .ok()
        .flatten()
}

/// Load a BIP84 wallet from changeset JSON, or create empty when missing/unusable.
/// Second value is `true` when the wallet was created empty (not loaded).
pub(crate) fn create_or_load_bip84_wallet(
    xprv: Xpriv,
    network: Network,
    changeset_json: Option<&str>,
) -> Result<(BdkWallet, bool)> {
    let bdk_network = bumper_bdk_network(network);
    if let Some(json) = changeset_json {
        if let Some(loaded) = try_load_bip84_from_changeset(xprv, bdk_network, json) {
            return Ok((loaded, false));
        }
    }
    let external = bdk_wallet::template::Bip84(xprv, KeychainKind::External);
    let change = bdk_wallet::template::Bip84(xprv, KeychainKind::Internal);
    let wallet = BdkWallet::create(external, change)
        .network(bdk_network)
        .create_wallet_no_persist()?;
    Ok((wallet, true))
}

#[cfg(test)]
mod onchain_wallet_scan_kind_tests {
    use super::{
        bumper_bdk_network, completed_full_scan_from_hydrate, create_or_load_bip84_wallet,
        onchain_wallet_scan_kind, OnchainWalletScanKind,
    };
    use bdk_wallet::KeychainKind;
    use bitcoin::bip32::Xpriv;
    use bitcoin::Network;

    fn test_xprv(network: Network) -> Xpriv {
        Xpriv::new_master(network, &[7u8; 32]).expect("xprv")
    }

    #[test]
    fn onchain_wallet_scan_kind_is_full_before_first_scan_and_incremental_after() {
        assert_eq!(onchain_wallet_scan_kind(false), OnchainWalletScanKind::Full);
        assert_eq!(
            onchain_wallet_scan_kind(true),
            OnchainWalletScanKind::Incremental
        );
    }

    #[test]
    fn onchain_wallet_scan_kind_is_incremental_when_hydrated_with_full_scan_done() {
        assert_eq!(
            onchain_wallet_scan_kind(completed_full_scan_from_hydrate(true, false)),
            OnchainWalletScanKind::Incremental
        );
        assert_eq!(
            onchain_wallet_scan_kind(completed_full_scan_from_hydrate(false, false)),
            OnchainWalletScanKind::Full
        );
        assert_eq!(
            onchain_wallet_scan_kind(completed_full_scan_from_hydrate(true, true)),
            OnchainWalletScanKind::Full
        );
    }

    #[test]
    fn load_bip84_changeset_roundtrip_or_empty_on_invalid() {
        let xprv = test_xprv(Network::Signet);
        let (mut created, used_empty) =
            create_or_load_bip84_wallet(xprv, Network::Signet, None).expect("create");
        assert!(used_empty);
        let revealed = created.next_unused_address(KeychainKind::External).address;
        let changeset = created.take_staged().expect("staged after reveal");
        let changeset_json = serde_json::to_string(&changeset).expect("serialize");

        let (loaded, loaded_empty) =
            create_or_load_bip84_wallet(xprv, Network::Signet, Some(&changeset_json))
                .expect("load");
        assert!(!loaded_empty);
        assert_eq!(
            loaded.peek_address(KeychainKind::External, 0).address,
            revealed
        );

        for unusable in [Some(""), Some("{}"), Some("not-json")] {
            let (_, empty) =
                create_or_load_bip84_wallet(xprv, Network::Signet, unusable).expect("fallback");
            assert!(empty, "expected empty wallet for {unusable:?}");
        }
    }

    #[test]
    fn bumper_bdk_network_maps_testnet_to_testnet4() {
        assert_eq!(bumper_bdk_network(Network::Testnet), Network::Testnet4);
        assert_eq!(bumper_bdk_network(Network::Testnet4), Network::Testnet4);
        assert_eq!(bumper_bdk_network(Network::Signet), Network::Signet);
        assert_eq!(bumper_bdk_network(Network::Bitcoin), Network::Bitcoin);
        assert_eq!(bumper_bdk_network(Network::Regtest), Network::Regtest);
    }
}
