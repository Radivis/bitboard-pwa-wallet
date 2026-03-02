/**
 * Format an ISO date string for display.
 * @param dateString - ISO 8601 date string (e.g. from API)
 * @param options - Optional format overrides. Use month: 'short' for compact (e.g. "Jan 15, 2024"), 'long' for full (e.g. "January 15, 2024")
 */
export function formatDate(
  dateString: string,
  options?: { month?: 'short' | 'long' }
): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: options?.month ?? 'long',
    day: 'numeric',
  })
}
