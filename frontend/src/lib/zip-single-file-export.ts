import JSZip from 'jszip'
import { readFileAsArrayBuffer } from '@/lib/read-file-as-array-buffer'

/** Shared DEFLATE export options for local download ZIPs. */
export async function finalizeZipExportWithDeflate(zip: JSZip): Promise<Blob> {
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
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
  const buffer = await readFileAsArrayBuffer(source)
  zip.file(entryFileName, buffer)
  return finalizeZipExportWithDeflate(zip)
}
