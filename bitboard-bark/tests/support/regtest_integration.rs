use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use bitboard_bark::regtest_session::RegtestBarkWallet;
use serde::Deserialize;

pub const DEFAULT_CAPTAIND_URL: &str = "http://127.0.0.1:3535";
pub const DEFAULT_ESPLORA_URL: &str = "http://localhost:7030/api";
pub const DEFAULT_CAPTAIND_CONTAINER: &str = "bitboard-regtest-captaind";

/// Fresh regtest wallet. The same phrase is safe to recreate; the dump lives in memory.
pub const FRESH_REGTEST_MNEMONIC: &str =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

pub fn regtest_enabled() -> bool {
    std::env::var("BARK_REGTEST_RUN")
        .map(|value| value == "1")
        .unwrap_or(false)
}

pub struct RegtestEndpoints {
    pub captaind_url: String,
    pub esplora_url: String,
    pub captaind_container: String,
}

pub fn regtest_endpoints() -> RegtestEndpoints {
    RegtestEndpoints {
        captaind_url: std::env::var("BARK_REGTEST_CAPTAIND_URL")
            .unwrap_or_else(|_| DEFAULT_CAPTAIND_URL.to_string()),
        esplora_url: std::env::var("BARK_REGTEST_ESPLORA_URL")
            .unwrap_or_else(|_| DEFAULT_ESPLORA_URL.to_string()),
        captaind_container: std::env::var("CAPTAIND_REGTEST_CONTAINER")
            .unwrap_or_else(|_| DEFAULT_CAPTAIND_CONTAINER.to_string()),
    }
}

fn docker(args: &[&str]) {
    let status = Command::new("docker").args(args).status().expect("docker");
    assert!(status.success(), "docker {} failed", args.join(" "));
}

/// Stops captaind for the guard's lifetime, then starts it again.
pub struct CaptaindPauseGuard {
    container: String,
}

impl CaptaindPauseGuard {
    pub fn pause(endpoints: &RegtestEndpoints) -> Self {
        docker(&["stop", &endpoints.captaind_container]);
        Self {
            container: endpoints.captaind_container.clone(),
        }
    }
}

impl Drop for CaptaindPauseGuard {
    fn drop(&mut self) {
        let _ = Command::new("docker")
            .args(["start", &self.container])
            .status();
        std::thread::sleep(Duration::from_secs(8));
    }
}

pub async fn open_fresh_regtest_wallet(endpoints: &RegtestEndpoints) -> RegtestBarkWallet {
    RegtestBarkWallet::open_empty(
        FRESH_REGTEST_MNEMONIC,
        &endpoints.captaind_url,
        &endpoints.esplora_url,
    )
    .await
    .expect("open regtest wallet")
}

pub fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

pub fn resolve_repo_path(path: &str) -> PathBuf {
    let path_buf = PathBuf::from(path);
    if path_buf.is_absolute() {
        return path_buf;
    }
    if let Ok(cwd) = std::env::current_dir() {
        let from_cwd = cwd.join(&path_buf);
        if from_cwd.is_file() {
            return from_cwd;
        }
    }
    repo_root().join(path_buf)
}

#[derive(Deserialize)]
struct BoardedFixtureFile {
    mnemonic: String,
    #[serde(rename = "recordDump")]
    record_dump: String,
}

/// `BARK_REGTEST_BOARDED_FIXTURE`, or the Playwright export under `frontend/test-results/`.
pub fn load_boarded_fixture() -> (String, String) {
    let path = std::env::var("BARK_REGTEST_BOARDED_FIXTURE")
        .unwrap_or_else(|_| "frontend/test-results/bark-boarded-fixture.json".to_owned());
    let resolved = resolve_repo_path(&path);
    let text = std::fs::read_to_string(&resolved).unwrap_or_else(|err| {
        panic!(
            "boarded Bark fixture {} is missing ({err}). Run npm run test:e2e:bark-regtest first.",
            resolved.display()
        )
    });
    let parsed: BoardedFixtureFile =
        serde_json::from_str(&text).expect("boarded Bark fixture json");
    (parsed.mnemonic, parsed.record_dump)
}

pub async fn open_boarded_fixture_with_exit_bumper(
    endpoints: &RegtestEndpoints,
) -> RegtestBarkWallet {
    let (mnemonic, record_dump) = load_boarded_fixture();
    let wallet = RegtestBarkWallet::open_from_encoded_dump_with_exit_bumper(
        &mnemonic,
        &record_dump,
        &endpoints.captaind_url,
        &endpoints.esplora_url,
    )
    .await
    .expect("open boarded fixture with exit bumper");
    let address = wallet
        .exit_bumper_address()
        .await
        .expect("exit bumper address");
    fund_regtest_address(&address, "0.01");
    wallet.sync_exit_bumper().await.expect("sync exit bumper");
    let balance_sats = wallet
        .exit_bumper_balance_sats()
        .await
        .expect("exit bumper balance");
    assert!(
        balance_sats > 0,
        "exit bumper {address} has no funds after the faucet"
    );
    wallet
}

pub async fn open_boarded_fixture(endpoints: &RegtestEndpoints) -> RegtestBarkWallet {
    let (mnemonic, record_dump) = load_boarded_fixture();
    RegtestBarkWallet::open_from_encoded_dump(
        &mnemonic,
        &record_dump,
        &endpoints.captaind_url,
        &endpoints.esplora_url,
    )
    .await
    .expect("open boarded fixture")
}

pub fn fund_regtest_address(address: &str, amount_btc: &str) {
    let regtest_cli = repo_root().join("regtest/regtest.mjs");
    let status = Command::new("node")
        .arg(&regtest_cli)
        .args(["faucet", address, amount_btc, "--confirm"])
        .current_dir(repo_root())
        .status()
        .expect("node regtest.mjs faucet");
    assert!(status.success(), "regtest faucet to {address} failed");
}

pub fn mine_regtest_blocks(count: u32) {
    let tip_before = esplora_tip_height();
    let regtest_cli = repo_root().join("regtest/regtest.mjs");
    let status = Command::new("node")
        .arg(&regtest_cli)
        .args(["mine", &count.to_string()])
        .current_dir(repo_root())
        .status()
        .expect("node regtest.mjs mine");
    assert!(status.success(), "regtest mine {count} failed");
    let target = tip_before + count;
    for _attempt in 0..40 {
        if esplora_tip_height() >= target {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    panic!(
        "esplora tip stayed at {} after mining {count} blocks toward {target}",
        esplora_tip_height()
    );
}

fn esplora_tip_height() -> u32 {
    let url = format!(
        "{}/blocks/tip/height",
        DEFAULT_ESPLORA_URL.trim_end_matches('/')
    );
    let output = Command::new("curl")
        .args(["-sf", &url])
        .output()
        .expect("curl esplora tip");
    assert!(output.status.success(), "esplora tip request failed");
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .expect("esplora tip height")
}

pub async fn broadcast_raw_tx(esplora_url: &str, raw_tx_hex: &str) -> String {
    let url = format!("{}/tx", esplora_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .body(raw_tx_hex.to_owned())
        .send()
        .await
        .expect("esplora broadcast");
    let status = response.status();
    let body = response.text().await.expect("esplora broadcast body");
    assert!(
        status.is_success(),
        "esplora broadcast failed ({status}): {body}"
    );
    body.trim().to_owned()
}
