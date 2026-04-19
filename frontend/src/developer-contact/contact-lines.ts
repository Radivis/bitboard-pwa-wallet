import contactLinesRaw from './contact-lines.txt?raw'

/** Trimmed multiline developer contact (Settings). Empty file hides the card. */
export function getDeveloperContactLines(): string {
  return contactLinesRaw.trim()
}
