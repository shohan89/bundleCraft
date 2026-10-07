/**
 * Dependency-free so both the server guard and the browser API client can
 * import it. See lib/api/guard.ts for why mutating requests need this.
 */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "bundlecraft";
