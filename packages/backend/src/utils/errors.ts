/**
 * Type guards and utilities for error handling
 *
 * This module provides type-safe error handling utilities to replace
 * `error: any` with proper type checking.
 */

/**
 * Type guard to check if value is an Error object
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if error has a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Type guard for Axios errors
 */
export function isAxiosError(error: unknown): error is {
  message: string;
  response?: { data?: unknown; status?: number };
  config?: unknown;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as { isAxiosError: unknown }).isAxiosError === true
  );
}

/**
 * Extract error message safely from any error type
 *
 * Handles:
 * - Error objects (standard and custom)
 * - Axios errors
 * - Objects with message property
 * - String errors
 * - null/undefined
 * - Any other type
 *
 * @param error - Unknown error value
 * @returns Human-readable error message
 */
export function getErrorMessage(error: unknown): string {
  // Handle Error objects (standard and custom)
  if (isError(error)) {
    return error.message;
  }

  // Handle Axios errors specifically
  if (isAxiosError(error)) {
    return error.message;
  }

  // Handle objects with message property
  if (hasMessage(error)) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Handle null/undefined
  if (error === null || error === undefined) {
    return 'Unknown error occurred';
  }

  // Handle everything else - try to stringify
  try {
    const stringified = JSON.stringify(error);
    return stringified === '{}' ? 'Unknown error occurred' : stringified;
  } catch {
    return 'Unknown error occurred';
  }
}

/**
 * Extract detailed error information for logging
 *
 * Returns structured object with:
 * - message: Error message
 * - stack: Stack trace (if available)
 * - type: Error type/constructor name
 * - response: Axios response data (if applicable)
 * - status: HTTP status code (if applicable)
 *
 * @param error - Unknown error value
 * @returns Structured error details object
 */
export function getErrorDetails(error: unknown): {
  message: string;
  stack?: string;
  type: string;
  response?: unknown;
  status?: number;
} {
  // Handle standard Error objects
  if (isError(error)) {
    return {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name,
    };
  }

  // Handle Axios errors with additional context
  if (isAxiosError(error)) {
    return {
      message: error.message,
      type: 'AxiosError',
      response: error.response?.data,
      status: error.response?.status,
    };
  }

  // Handle other types
  return {
    message: getErrorMessage(error),
    type: typeof error,
  };
}

/**
 * Create a structured Error object from unknown error
 * Useful for re-throwing with proper type
 *
 * @param error - Unknown error value
 * @param context - Additional context to add to error message
 * @returns Standard Error object
 */
export function toError(error: unknown, context?: string): Error {
  const message = getErrorMessage(error);
  const fullMessage = context ? `${context}: ${message}` : message;

  // If already an Error, preserve it
  if (isError(error)) {
    error.message = fullMessage;
    return error;
  }

  // Create new Error
  return new Error(fullMessage);
}

/**
 * Log error with consistent format
 * Helper for use with logger
 *
 * @param logger - Logger instance
 * @param level - Log level
 * @param message - Log message
 * @param error - Error to log
 * @param additionalContext - Additional context
 */
export function logError(
  logger: {
    error: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
  },
  level: 'error' | 'warn',
  message: string,
  error: unknown,
  additionalContext?: Record<string, unknown>
): void {
  const errorDetails = getErrorDetails(error);
  const logData = {
    ...errorDetails,
    ...additionalContext,
  };

  if (level === 'error') {
    logger.error(message, logData);
  } else {
    logger.warn(message, logData);
  }
}
