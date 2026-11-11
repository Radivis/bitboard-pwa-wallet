import { describe, expect, it } from 'vitest'
import pastedInvisibleCodePoints from '../pasted-invisible-code-points.json'
import { stripPastedInvisibleCharacters } from '../strip-pasted-invisible-characters'

const BIDI_OVERRIDE = 0x202e
const ZERO_WIDTH_SPACE = 0x200b
const BACKTICK = 0x60

function strippedCodePoints(): number[] {
  const stripped: number[] = []
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue
    const character = String.fromCodePoint(codePoint)
    if (stripPastedInvisibleCharacters(character) === '') {
      stripped.push(codePoint)
    }
  }
  return stripped
}

describe('stripPastedInvisibleCharacters', () => {
  it('strips the shared vector, including a bidi override, a zero-width mark, and a backtick', () => {
    const listed = pastedInvisibleCodePoints.map((hex) =>
      Number.parseInt(hex, 16),
    )
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed).toContain(BIDI_OVERRIDE)
    expect(listed).toContain(ZERO_WIDTH_SPACE)
    expect(listed).toContain(BACKTICK)

    const expected = [...listed].sort((left, right) => left - right)
    expect(strippedCodePoints()).toEqual(expected)

    const address = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    const polluted = `\u202E${address.slice(0, 4)}\u200B${address.slice(4)}\``
    expect(stripPastedInvisibleCharacters(polluted)).toBe(address)
  })
})
