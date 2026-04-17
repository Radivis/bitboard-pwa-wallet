import JSZip from 'jszip'

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
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

/**
 * Packs a single file into a ZIP archive for local export (e.g. email attachment).
 * Uses DEFLATE; SQLite compresses moderately and wrapping avoids raw `.sqlite` attachments.
 */
export async function zipSingleFileForLocalExport(
  source: Blob,
  entryFileName: string,
): Promise<Blob> {
  const zip = new JSZip()
  const buffer = await blobToArrayBuffer(source)
  zip.file(entryFileName, buffer)
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  })
}
