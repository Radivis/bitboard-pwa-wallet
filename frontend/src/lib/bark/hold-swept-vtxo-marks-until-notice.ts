/**
 * Keeps a swept-coin spent mark in memory until `mergeNotice` stores the notice.
 * A failure before that store restores the coins, so the following envelope
 * export does not save the mark without the notice.
 */
export async function holdSweptVtxoMarksUntilNoticeIsStored<TSynced, TMerged>(params: {
  barkSync: () => Promise<TSynced>
  mergeNotice: (synced: TSynced) => Promise<TMerged>
  commitSweptVtxoMarks: () => void | Promise<void>
  revertSweptVtxoMarks: () => void | Promise<void>
}): Promise<{ synced: TSynced; merged: TMerged }> {
  let sweptMarksAreHeld = false
  try {
    const synced = await params.barkSync()
    sweptMarksAreHeld = true
    const merged = await params.mergeNotice(synced)
    await params.commitSweptVtxoMarks()
    sweptMarksAreHeld = false
    return { synced, merged }
  } finally {
    if (sweptMarksAreHeld) {
      try {
        await params.revertSweptVtxoMarks()
      } catch (err) {
        console.warn(
          'Bark could not restore swept coins after the seizure notice was not stored',
          err,
        )
      }
    }
  }
}
