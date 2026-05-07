/**
 * KaTeX-backed `InlineMath` and `BlockMath` for TSX (library articles, etc.).
 * Wraps `react-katex` and loads KaTeX CSS once.
 *
 * Formulas with LaTeX macros must use `math={InlineMath.tex`…`}` or `math={BlockMath.tex`…`}`
 * (same behavior as `String.raw`).
 *
 * @see ../../../README.md — section **LaTeX (KaTeX) in TSX**
 */
import 'katex/dist/katex.min.css'
import {
  BlockMath as ReactKatexBlockMath,
  InlineMath as ReactKatexInlineMath,
} from 'react-katex'
import type { ComponentProps } from 'react'

type InlineMathProps = ComponentProps<typeof ReactKatexInlineMath>
type BlockMathProps = ComponentProps<typeof ReactKatexBlockMath>

export const InlineMath = Object.assign(
  function InlineMath(props: InlineMathProps) {
    return <ReactKatexInlineMath {...props} />
  },
  /** Tagged template for `math` — same as `String.raw`. See `frontend/README.md` (LaTeX / KaTeX in TSX). */
  { tex: String.raw },
)

export const BlockMath = Object.assign(
  function BlockMath(props: BlockMathProps) {
    return <ReactKatexBlockMath {...props} />
  },
  /** Tagged template for `math` — same as `String.raw`. See `frontend/README.md` (LaTeX / KaTeX in TSX). */
  { tex: String.raw },
)
