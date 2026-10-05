use std::process::Command;
use std::time::Duration;

use bitboard_bark::regtest_session::RegtestBarkWallet;

pub const DEFAULT_CAPTAIND_URL: &str = "http://127.0.0.1:3535";
pub const DEFAULT_ESPLORA_URL: &str = "http://localhost:7030/api";
pub const DEFAULT_CAPTAIND_CONTAINER: &str = "bitboard-regtest-captaind";

/// Fresh regtest wallet. The same phrase is safe to recreate; the dump lives in memory.
pub const FRESH_REGTEST_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

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
    let status = Command::new("docker")
        .args(args)
        .status()
        .expect("docker");
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
