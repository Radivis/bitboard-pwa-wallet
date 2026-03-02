/**
 * Returns the first non-empty error message from an array of Error objects or strings.
 * Useful for extracting a displayable message from multiple potential error sources.
 */
export function findFirstErrorMessage(
  candidates: ReadonlyArray<Error | string | null | undefined>
): string | undefined {
  for (const c of candidates) {
    if (c instanceof Error && c.message?.trim()) return c.message.trim();
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}
