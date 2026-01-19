/**
 * Validation utilities for the Sequentum MCP server
 * Contains reusable validation functions that can be shared across modules
 */

/**
 * Validates that a startTime string is a valid ISO 8601 date and is in the future
 * @param startTime - The start time to validate (ISO 8601 format)
 * @param minutesAhead - Minimum minutes in the future required (default: 1)
 * @throws Error if startTime is invalid or not far enough in the future
 */
export function validateStartTimeInFuture(
  startTime: string,
  minutesAhead: number = 1
): void {
  const start = new Date(startTime);
  const now = new Date();
  const minFuture = new Date(now.getTime() + minutesAhead * 60 * 1000);

  if (isNaN(start.getTime())) {
    throw new Error(
      `Invalid startTime format: ${startTime}. Use ISO 8601 format (e.g., 2026-01-20T14:30:00Z)`
    );
  }

  if (start <= minFuture) {
    throw new Error(
      `startTime must be at least ${minutesAhead} minute(s) in the future (UTC). Provided: ${startTime}`
    );
  }
}
