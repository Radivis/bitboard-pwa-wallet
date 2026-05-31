/**
 * `VITE_ARGON2_CI=1` switches Argon2 to fast CI parameters in non-production builds.
 * Must stay aligned with `encryption.worker.ts` guardrails.
 */

function viteArgon2CiRaw(): boolean {
  if (typeof import.meta.env === 'undefined') return false
  return import.meta.env.VITE_ARGON2_CI === '1'
}

function isProductionBuild(): boolean {
  if (typeof import.meta.env === 'undefined') return false
  return import.meta.env.PROD === true
}

/** Throws if CI Argon2 is enabled in a production build. */
export function assertArgon2CiNotAllowedInProduction(): void {
  if (viteArgon2CiRaw() && isProductionBuild()) {
    throw new Error(
      'Security guardrail: VITE_ARGON2_CI=1 is not allowed in production builds.',
    )
  }
}

/**
 * Whether to use CI Argon2 parameters (fast) instead of production costs.
 * Asserts production builds never enable CI Argon2.
 */
export function resolveArgon2CiParamsOrThrow(): boolean {
  assertArgon2CiNotAllowedInProduction()
  return viteArgon2CiRaw()
}
