/**
 * Standard result type for operations that can succeed or fail.
 * Use this instead of throwing errors for expected failure cases.
 *
 * @example
 * ```ts
 * // Success case
 * return { success: true, data: { title: "Page Title" } };
 *
 * // Error case
 * return { success: false, error: "network_error", errorMessage: "Request timed out" };
 * ```
 */
export type Result<T, E extends string = string> =
  | { success: true; data: T }
  | { success: false; error: E; errorMessage?: string };

/**
 * Create a success result.
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failure result.
 */
export function err<E extends string>(error: E, errorMessage?: string): Result<never, E> {
  return { success: false, error, errorMessage };
}

/**
 * Check if a result is successful (type guard).
 */
export function isOk<T, E extends string>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success;
}

/**
 * Check if a result is an error (type guard).
 */
export function isErr<T, E extends string>(result: Result<T, E>): result is { success: false; error: E; errorMessage?: string } {
  return !result.success;
}

/**
 * Unwrap a result, throwing if it's an error.
 * Use sparingly - prefer pattern matching with isOk/isErr.
 */
export function unwrap<T, E extends string>(result: Result<T, E>): T {
  if (result.success) {
    return result.data;
  }
  throw new Error(result.errorMessage || result.error);
}

/**
 * Unwrap a result with a default value for errors.
 */
export function unwrapOr<T, E extends string>(result: Result<T, E>, defaultValue: T): T {
  return result.success ? result.data : defaultValue;
}

/**
 * Map over a successful result.
 */
export function map<T, U, E extends string>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> {
  if (result.success) {
    return { success: true, data: fn(result.data) };
  }
  return result;
}

/**
 * Common error codes used across plugins.
 * Plugins can extend this with their own codes.
 */
export type CommonErrorCode =
  | "network_error"
  | "timeout"
  | "parse_error"
  | "not_found"
  | "auth_required"
  | "invalid_input"
  | "unknown";
