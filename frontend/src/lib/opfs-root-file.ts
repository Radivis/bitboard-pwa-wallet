/**
 * Read/write files in the OPFS root (`navigator.storage.getDirectory()`).
 * Used for migration diagnostics and local export of SQLite DB files (no network).
 */

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

export async function readTextFileFromOpfsRootIfExists(fileName: string): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return null
  }
  try {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle(fileName, { create: false })
    const file = await handle.getFile()
    return await file.text()
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw error
  }
}

export async function readBlobFromOpfsRootIfExists(fileName: string): Promise<Blob | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return null
  }
  try {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle(fileName, { create: false })
    const file = await handle.getFile()
    return await file.arrayBuffer().then((buf) => new Blob([buf]))
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw error
  }
}

export async function opfsRootFileExists(fileName: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return false
  }
  try {
    const root = await navigator.storage.getDirectory()
    await root.getFileHandle(fileName, { create: false })
    return true
  } catch (error) {
    if (isNotFoundError(error)) return false
    throw error
  }
}

export async function writeTextFileToOpfsRoot(fileName: string, contents: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS (navigator.storage.getDirectory) is not available')
  }
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle(fileName, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(contents)
  } finally {
    await writable.close()
  }
}

/**
 * Saves a blob as a local file (browser save / download attribute). Not a remote server; user-facing copy should say "Export".
 */
export function triggerBrowserSaveLocalBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
