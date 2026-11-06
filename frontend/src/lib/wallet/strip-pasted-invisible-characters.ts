/**
 * Characters that survive `trim` but break Bitcoin address parsers:
 * zero-width and bidi format marks, a byte-order mark, a soft hyphen, and
 * markdown backticks. Keep in sync with `crypto/src/address_input.rs`.
 */
const PASTED_INVISIBLE_OR_BACKTICK_CODE_POINTS = new Set<number>([
  0x00ad, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b,
  0x202c, 0x202d, 0x202e, 0x2060, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff,
  0x60,
])

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
