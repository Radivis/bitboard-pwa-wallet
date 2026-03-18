/**
 * serde_wasm_bindgen maps serde_json::Value::Object to JavaScript Map (not plain objects).
 * Property access like `value.new_utxos` is undefined on Map — use this before reading fields.
 */
export function wasmSerdeValueToPlainJson(value: unknown): unknown {
  if (value instanceof Map) {
    const plain_object: Record<string, unknown> = {}
    for (const [map_key, map_value] of value.entries()) {
      plain_object[String(map_key)] = wasmSerdeValueToPlainJson(map_value)
    }
    return plain_object
  }
  if (Array.isArray(value)) {
    return value.map((item) => wasmSerdeValueToPlainJson(item))
  }
  return value
}
