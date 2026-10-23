use wasm_bindgen::prelude::*;

/// Names `bark::Wallet` so the wasm link actually pulls in `bark-wallet`.
/// Does not open a session.
#[wasm_bindgen]
pub fn bark_link_smoke() -> String {
    std::any::type_name::<bark::Wallet>().to_owned()
}
