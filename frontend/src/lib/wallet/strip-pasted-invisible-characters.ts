import pastedInvisibleCodePoints from './pasted-invisible-code-points.json'

/**
 * Characters that survive `trim` but break Bitcoin address parsers:
 * zero-width and bidi format marks, a byte-order mark, a soft hyphen, and
 * markdown backticks. The vector is `pasted-invisible-code-points.json`.
 * `crypto/src/address_input.rs` keeps the same set, and both sides are tested
 * against that file.
 */
const PASTED_INVISIBLE_OR_BACKTICK_CODE_POINTS = new Set(
  pastedInvisibleCodePoints.map((hex) => Number.parseInt(hex, 16)),
)

export function stripPastedInvisibleCharacters(value: string): string {
  const keptCharacters: string[] = []
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (
      codePoint != null &&
      PASTED_INVISIBLE_OR_BACKTICK_CODE_POINTS.has(codePoint)
    ) {
      continue
    }
    keptCharacters.push(character)
  }
  return keptCharacters.join('')
}
