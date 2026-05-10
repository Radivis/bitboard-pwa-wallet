/**
 * KaTeX-backed `InlineMath` and `BlockMath` for TSX (library articles, etc.).
 * Wraps `react-katex` and loads KaTeX CSS once.
 *
 * Formulas with LaTeX macros must use `math={InlineMath.tex`…`}` or `math={BlockMath.tex`…`}`.
 * The tag reads **only** `TemplateStringsArray.raw` (never `${…}` — see README). That preserves
 * every backslash (`\frac`, `\pmod`, `\equiv`, `\mod`, `\cdot`, …) — plain JSX quoted strings do
 * not, because `\f`, `\n`, `\t`, `\b`, … are JavaScript escape sequences and silently corrupt
 * LaTeX source.
 *
 * Note (production builds): `vite.config.ts` aliases the bare `katex` specifier to KaTeX's
 * **ESM** entry (`katex/dist/katex.mjs`). Without that alias, `react-katex`'s `require("katex")`
 * resolves to the CJS UMD build, and Rolldown's CJS interop bundles it in a way where macro
 * registrations land in a different scope than the parser reads — production then shows
 * `\frac`, `\in`, `\mod`, `\equiv`, `\pmod`, … as red “undefined control sequence” fragments.
 *
 * @see ../../../README.md — section **KaTeX in production (alias `katex` to its ESM entry)**
 */
import 'katex/dist/katex.min.css'
import {
  BlockMath as ReactKatexBlockMath,
  InlineMath as ReactKatexInlineMath,
} from 'react-katex'
import type { ComponentProps } from 'react'

type InlineMathProps = ComponentProps<typeof ReactKatexInlineMath>
type BlockMathProps = ComponentProps<typeof ReactKatexBlockMath>

/**
 * Tagged-template source for KaTeX: uses raw segments only (like `String.raw`), and rejects
 * `${…}` interpolation so values are never merged via JS “cooked” escape rules (which turn `\n`
 * inside `\not`, `\neq`, … into real newlines).
 */
function katexSourceFromRawTemplate(
  staticParts: TemplateStringsArray,
  ...substitutions: unknown[]
): string {
  if (substitutions.length > 0) {
    throw new Error(
      'InlineMath.tex / BlockMath.tex must not use ${…} inside the template — interpolations break LaTeX backslashes.',
    )
  }
  return staticParts.raw.join('')
}

export const InlineMath = Object.assign(
  function InlineMath(props: InlineMathProps) {
    return <ReactKatexInlineMath {...props} />
  },
  /** Tagged template for `math` — see `frontend/README.md` (LaTeX / KaTeX in TSX). */
  { tex: katexSourceFromRawTemplate },
)

export const BlockMath = Object.assign(
  function BlockMath(props: BlockMathProps) {
    return <ReactKatexBlockMath {...props} />
  },
  /** Tagged template for `math` — see `frontend/README.md` (LaTeX / KaTeX in TSX). */
  { tex: katexSourceFromRawTemplate },
)
