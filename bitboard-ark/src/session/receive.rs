use crate::error::ArkResult;

use super::ArkSession;

impl ArkSession {
    pub fn peek_offchain_address(&self) -> ArkResult<String> {
        let (address, _) = self.client.peek_offchain_receive_address()?;
        Ok(address.to_string())
    }

    pub fn reveal_next_offchain_address(&self) -> ArkResult<String> {
        let (address, _) = self.client.reveal_next_offchain_receive_address()?;
        Ok(address.to_string())
    }
}
