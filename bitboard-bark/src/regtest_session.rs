//! Native opener for Bark regtest integration tests.
//!
//! Compiled only with `--features regtest-support`. It is not a wasm export
//! and it does not change `bark_open_session`.

use std::sync::Arc;

use bitcoin::Network;
use bitcoin::absolute::LockTime;
use bitcoin::transaction::Version;
use bitcoin::{
    Address, Amount, FeeRate, OutPoint, Psbt, ScriptBuf, Sequence, Transaction, TxIn, TxOut,
    Witness,
};

use crate::exit_address::spent_vtxo_ids_named_by_server;
use crate::offboard_retirement::retire_offboard_if_server_spent_an_input;
use crate::record_store::SharedRecordStore;

pub struct RegtestBarkWallet {
    wallet: bark::Wallet,
    store: SharedRecordStore,
    exit_bumper: Option<ExitBumper>,
}

type ExitBumper = std::sync::Arc<tokio::sync::RwLock<dyn bark::onchain::OnchainWalletTrait>>;

impl RegtestBarkWallet {
    /// Creates a wallet on an empty record store. The server must be up:
    /// `Wallet::open` handshakes before this returns.
    pub async fn open_empty(
        mnemonic: &str,
        server_url: &str,
        esplora_url: &str,
    ) -> Result<Self, String> {
        Self::open_store(
            mnemonic,
            server_url,
            esplora_url,
            SharedRecordStore::empty(),
            None,
        )
        .await
    }

    /// Opens the wallet that produced `encoded_dump`.
    pub async fn open_from_encoded_dump(
        mnemonic: &str,
        encoded_dump: &str,
        server_url: &str,
        esplora_url: &str,
    ) -> Result<Self, String> {
        let store = SharedRecordStore::from_encoded_dump(encoded_dump)?;
        Self::open_store(mnemonic, server_url, esplora_url, store, None).await
    }

    /// Same dump, plus a BDK wallet that can pay the exit child transaction.
    pub async fn open_from_encoded_dump_with_exit_bumper(
        mnemonic: &str,
        encoded_dump: &str,
        server_url: &str,
        esplora_url: &str,
    ) -> Result<Self, String> {
        let store = SharedRecordStore::from_encoded_dump(encoded_dump)?;
        let network = Network::Regtest;
        let persister = Arc::new(bark::persist::adaptor::StorageAdaptorWrapper::new(
            store.clone(),
        ));
        let bumper: ExitBumper = Arc::new(tokio::sync::RwLock::new(
            bark::onchain::OnchainWallet::load_or_create(network, [7u8; 64], persister.clone())
                .await
                .map_err(|err| format!("{err:#}"))?,
        ));
        Self::open_store(mnemonic, server_url, esplora_url, store, Some(bumper)).await
    }

    async fn open_store(
        mnemonic: &str,
        server_url: &str,
        esplora_url: &str,
        store: SharedRecordStore,
        exit_bumper: Option<ExitBumper>,
    ) -> Result<Self, String> {
        let network = Network::Regtest;
        let parsed_mnemonic = bip39::Mnemonic::parse(mnemonic).map_err(|err| err.to_string())?;
        let seed = bark::WalletSeed::new_from_mnemonic(network, &parsed_mnemonic);
        #[allow(deprecated)]
        let config = bark::Config {
            server_address: server_url.to_owned(),
            esplora_address: Some(esplora_url.to_owned()),
            user_agent: Some(format!("bitboard/{}", env!("CARGO_PKG_VERSION"))),
            ..bark::Config::network_default(network)
        };
        let persister = Arc::new(bark::persist::adaptor::StorageAdaptorWrapper::new(
            store.clone(),
        ));
        let wallet = bark::Wallet::open(
            network,
            seed,
            config,
            bark::OpenWalletArgs {
                run_daemon: false,
                onchain: exit_bumper.clone(),
                create_if_not_exists: true,
                persister: Some(persister),
                lock_manager: Some(Box::new(
                    bark::lock_manager::memory::MemoryLockManager::new(),
                )),
                ..bark::OpenWalletArgs::default()
            },
        )
        .await
        .map_err(|err| format!("{err:#}"))?;
        Ok(Self {
            wallet,
            store,
            exit_bumper,
        })
    }

    pub async fn exit_bumper_address(&self) -> Result<String, String> {
        let bumper = self
            .exit_bumper
            .as_ref()
            .ok_or("exit bumper is not attached")?;
        let address = bumper
            .write()
            .await
            .address()
            .await
            .map_err(|err| format!("{err:#}"))?;
        Ok(address.to_string())
    }

    pub async fn sync_exit_bumper(&self) -> Result<(), String> {
        let bumper = self
            .exit_bumper
            .as_ref()
            .ok_or("exit bumper is not attached")?;
        bumper
            .write()
            .await
            .sync(self.wallet.chain())
            .await
            .map_err(|err| format!("{err:#}"))
    }

    pub async fn exit_bumper_balance_sats(&self) -> Result<u64, String> {
        let bumper = self
            .exit_bumper
            .as_ref()
            .ok_or("exit bumper is not attached")?;
        Ok(bumper.read().await.balance().await.to_sat())
    }

    pub fn export_encoded_dump(&self) -> Result<String, String> {
        self.store.export_encoded_dump()
    }

    /// The product sync path calls this before `Wallet::sync`. `sync` returns
    /// `()` and only logs a server failure, so the fail-fast check is here.
    pub async fn refresh_server(&self) -> Result<(), String> {
        self.wallet
            .refresh_server()
            .await
            .map_err(|err| format!("{err:#}"))
    }

    pub async fn sync(&self) {
        self.wallet.sync().await;
    }

    pub async fn spendable_vtxo_ids(&self) -> Result<Vec<String>, String> {
        let vtxos = self
            .wallet
            .spendable_vtxos()
            .await
            .map_err(|err| format!("{err:#}"))?;
        let mut ids = vtxos
            .iter()
            .map(|vtxo| vtxo.id().to_string())
            .collect::<Vec<_>>();
        ids.sort();
        Ok(ids)
    }

    /// A funding PSBT whose expiry is not the server lifetime. Captaind rejects the cosign.
    pub async fn board_psbt(&self) -> Result<(), String> {
        let (keypair, _) = self
            .wallet
            .peek_next_keypair()
            .await
            .map_err(|err| format!("{err:#}"))?;
        let ark_info = self
            .wallet
            .require_ark_info()
            .await
            .map_err(|err| format!("{err:#}"))?;
        let expiry_height = 0;
        let funding_script = bark::ark::board::BoardBuilder::new(
            keypair.public_key(),
            expiry_height,
            ark_info.server_pubkey,
            ark_info.vtxo_exit_delta,
        )
        .funding_script_pubkey();
        let psbt = unfunded_board_psbt(&funding_script, Amount::from_sat(50_000))?;
        self.wallet
            .board_psbt(psbt, keypair, expiry_height)
            .await
            .map(|_| ())
            .map_err(|err| format!("{err:#}"))
    }

    pub async fn offboard_all(&self, address: Address) -> Result<String, String> {
        self.wallet
            .offboard_all(address)
            .await
            .map(|txid| txid.to_string())
            .map_err(|err| format!("{err:#}"))
    }

    pub async fn offboard_vtxos(
        &self,
        vtxo_ids: &[String],
        address: Address,
    ) -> Result<String, String> {
        let selected = self.bare_vtxos_by_id(vtxo_ids).await?;
        self.wallet
            .offboard_vtxos(selected, address)
            .await
            .map(|txid| txid.to_string())
            .map_err(|err| format!("{err:#}"))
    }

    pub async fn start_exit_for_vtxos(&self, vtxo_ids: &[String]) -> Result<(), String> {
        let selected = self.bare_vtxos_by_id(vtxo_ids).await?;
        self.wallet
            .exit_mgr()
            .start_exit_for_vtxos(&selected)
            .await
            .map_err(|err| format!("{err:#}"))
    }

    pub async fn progress_exits(&self) -> Result<(), String> {
        self.wallet
            .progress_exits()
            .await
            .map_err(|err| format!("{err:#}"))
    }

    pub async fn pending_offboard_ids(&self) -> Result<Vec<String>, String> {
        let pending = self
            .wallet
            .pending_offboards()
            .await
            .map_err(|err| format!("{err:#}"))?;
        Ok(pending.into_iter().map(|offboard| offboard.id()).collect())
    }

    /// Ids the server named, after the product path records them spent and drops checkpoints.
    pub async fn retire_server_spent_offboard(
        &self,
        error_message: &str,
    ) -> Result<Vec<String>, String> {
        let named = spent_vtxo_ids_named_by_server(error_message);
        retire_offboard_if_server_spent_an_input(&self.wallet, error_message).await?;
        Ok(named)
    }

    pub async fn spent_vtxo_count(&self, vtxo_id: &str) -> Result<usize, String> {
        let vtxos = self
            .wallet
            .all_vtxos()
            .await
            .map_err(|err| format!("{err:#}"))?;
        Ok(vtxos
            .iter()
            .filter(|vtxo| {
                vtxo.id().to_string() == vtxo_id
                    && matches!(vtxo.state.kind(), bark::vtxo::VtxoStateKind::Spent)
            })
            .count())
    }

    /// `awaiting` while the timelock is running, `claimable` when a claim can be signed.
    pub async fn exit_progress_label(&self, vtxo_id: &str) -> Result<String, String> {
        let parsed = vtxo_id
            .parse()
            .map_err(|_| format!("Bark VTXO id is invalid: {vtxo_id}"))?;
        let status = self
            .wallet
            .exit_mgr()
            .get_exit_status(parsed, false, false)
            .await
            .map_err(|err| format!("{err:#}"))?;
        let Some(status) = status else {
            return Ok("missing".to_owned());
        };
        Ok(match &status.state {
            bark::exit::ExitState::AwaitingDelta(_) => "awaiting".to_owned(),
            bark::exit::ExitState::Claimable(_) => "claimable".to_owned(),
            other => format!("other:{other:?}"),
        })
    }

    pub async fn claimable_vtxo_ids(&self) -> Vec<String> {
        self.wallet
            .exit_mgr()
            .list_claimable()
            .await
            .into_iter()
            .map(|exit_vtxo| exit_vtxo.id().to_string())
            .collect()
    }

    /// Claimable ids that are not already in a pending claim.
    pub async fn claimable_ids_excluding(&self, excluded: &[String]) -> Vec<String> {
        self.claimable_vtxo_ids()
            .await
            .into_iter()
            .filter(|vtxo_id| !excluded.iter().any(|excluded_id| excluded_id == vtxo_id))
            .collect()
    }

    /// Signed claim transaction for one VTXO. Does not broadcast and does not sync exits.
    pub async fn drain_claim_raw_tx(
        &self,
        address: Address,
        vtxo_id: &str,
    ) -> Result<(String, Vec<String>), String> {
        let claimable = self.wallet.exit_mgr().list_claimable().await;
        let selected = claimable
            .into_iter()
            .filter(|exit_vtxo| exit_vtxo.id().to_string() == vtxo_id)
            .collect::<Vec<_>>();
        if selected.is_empty() {
            return Err(format!("VTXO {vtxo_id} is not claimable"));
        }
        let ids = selected
            .iter()
            .map(|exit_vtxo| exit_vtxo.id().to_string())
            .collect::<Vec<_>>();
        let fee_rate = FeeRate::from_sat_per_vb_u32(1);
        let psbt = self
            .wallet
            .exit_mgr()
            .drain_exits(&selected, &self.wallet, address, Some(fee_rate))
            .await
            .map_err(|err| format!("{err:#}"))?;
        let raw_tx = psbt
            .extract_tx()
            .map_err(|err| format!("claim transaction could not be extracted: {err}"))?;
        Ok((bitcoin::consensus::encode::serialize_hex(&raw_tx), ids))
    }

    async fn bare_vtxos_by_id(
        &self,
        vtxo_ids: &[String],
    ) -> Result<Vec<bark::ark::Vtxo<bark::ark::vtxo::Bare>>, String> {
        let vtxos = self
            .wallet
            .all_vtxos()
            .await
            .map_err(|err| format!("{err:#}"))?;
        let mut selected = Vec::with_capacity(vtxo_ids.len());
        for vtxo_id in vtxo_ids {
            let matched = vtxos
                .iter()
                .find(|vtxo| vtxo.id().to_string() == *vtxo_id)
                .ok_or_else(|| format!("VTXO {vtxo_id} is not in this wallet"))?;
            selected.push(matched.vtxo.clone());
        }
        Ok(selected)
    }
}

/// Regtest destination for an offboard or a claim. Not a wallet address.
pub fn regtest_receive_address() -> Address {
    let secp = bitcoin::secp256k1::Secp256k1::new();
    let secret = bitcoin::secp256k1::SecretKey::from_slice(&[1u8; 32]).expect("secret");
    let public_key = bitcoin::secp256k1::PublicKey::from_secret_key(&secp, &secret);
    let compressed = bitcoin::CompressedPublicKey(public_key);
    Address::p2wpkh(&compressed, Network::Regtest)
}

fn unfunded_board_psbt(funding_script: &ScriptBuf, amount: Amount) -> Result<Psbt, String> {
    let transaction = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::null(),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::default(),
        }],
        output: vec![TxOut {
            value: amount,
            script_pubkey: funding_script.to_owned(),
        }],
    };
    let mut psbt = Psbt::from_unsigned_tx(transaction).map_err(|err| err.to_string())?;
    psbt.inputs[0].witness_utxo = Some(TxOut {
        value: amount + Amount::from_sat(1_000),
        script_pubkey: ScriptBuf::new(),
    });
    Ok(psbt)
}
