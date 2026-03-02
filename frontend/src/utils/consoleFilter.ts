/**
 * Browser-compatible console filter utility
 * Filters out console messages matching specified patterns
 */

type FilterPattern = string | RegExp | ((message: string) => boolean)

interface ConsoleFilterOptions {
  methods?: Array<'log' | 'debug' | 'info' | 'warn' | 'error'>
}

/**
 * Filters console output based on provided patterns
 * @param patterns - Array of patterns to filter (string, RegExp, or function)
 * @param options - Configuration options
 * @returns Function to disable the filter
 */
export function filterConsole(
  patterns: FilterPattern[],
  options: ConsoleFilterOptions = {}
): () => void {
  const methods = options.methods ?? ['log', 'debug', 'info', 'warn', 'error']
  const originalMethods = new Map<string, typeof console.log>()

  const shouldFilter = (message: string): boolean => {
    return patterns.some(pattern => {
      if (typeof pattern === 'function') {
        return pattern(message)
      }
      if (pattern instanceof RegExp) {
        return pattern.test(message)
      }
      return message.includes(pattern)
    })
  }

  // Replace console methods
  methods.forEach(method => {
    const original = console[method]
    originalMethods.set(method, original)

    console[method] = (...args: any[]) => {
      try {
        const message = args.map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg)
            } catch {
              // Handle circular references or other stringify errors
              return String(arg)
            }
          }
          return String(arg)
        }).join(' ')

        if (!shouldFilter(message)) {
          original.apply(console, args)
        }
      } catch (error) {
        // If filtering fails for any reason, log anyway
        original.apply(console, args)
      }
    }
  })

  // Return function to restore original console methods
  return () => {
    methods.forEach(method => {
      const original = originalMethods.get(method)
      if (original) {
        console[method] = original
      }
    })
  }
}
