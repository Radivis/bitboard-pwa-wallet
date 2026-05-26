/**
 * Reads a `Blob` (including `File`) as `ArrayBuffer`.
 * `Blob.prototype.arrayBuffer` is missing in some test environments; `FileReader` works everywhere.
 */
export async function readFileAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsArrayBuffer(blob)
  })
}
