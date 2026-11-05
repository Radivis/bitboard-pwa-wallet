/**
 * Runs an envelope edit, then stores the companion record that must be saved
 * with it. The envelope stays unexported until that companion is stored.
 * A failure before then reverts the edit, so the following export saves neither.
 */
export async function holdBarkEnvelopeUntilCompanionIsStored<TEdited, TCompanion>(params: {
  editEnvelope: () => Promise<TEdited>
  storeCompanion: (edited: TEdited) => Promise<TCompanion>
  commitEnvelope: () => void | Promise<void>
  revertEnvelope: () => void | Promise<void>
  revertFailureWarning: string
}): Promise<{ edited: TEdited; companion: TCompanion }> {
  let envelopeEditIsHeld = false
  try {
    const edited = await params.editEnvelope()
    envelopeEditIsHeld = true
    const companion = await params.storeCompanion(edited)
    await params.commitEnvelope()
    envelopeEditIsHeld = false
    return { edited, companion }
  } finally {
    if (envelopeEditIsHeld) {
      try {
        await params.revertEnvelope()
      } catch (err) {
        console.warn(params.revertFailureWarning, err)
      }
    }
  }
}
