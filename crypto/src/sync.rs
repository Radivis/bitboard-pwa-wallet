use bdk_wallet::Wallet;

use crate::blockchain::BlockchainClient;
use crate::error::CryptoError;

pub async fn sync_wallet(
    wallet: &mut Wallet,
    client: &dyn BlockchainClient,
    parallel_requests: usize,
) -> Result<(), CryptoError> {
    let update = client.sync(wallet, parallel_requests).await?;
    wallet.apply_update(update)?;
    Ok(())
}

pub async fn full_scan_wallet(
    wallet: &mut Wallet,
    client: &dyn BlockchainClient,
    stop_gap: usize,
    parallel_requests: usize,
) -> Result<(), CryptoError> {
    let update = client
        .full_scan(wallet, stop_gap, parallel_requests)
        .await?;
    wallet.apply_update(update)?;
    Ok(())
}
