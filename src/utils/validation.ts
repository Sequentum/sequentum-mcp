/**
 * Validation utilities for the Sequentum MCP server
 * Contains reusable validation functions that can be shared across modules
 */

export interface NumberValidationOptions {
  required?: boolean;
  /** Minimum allowed value (inclusive) */
  min?: number;
  /** Maximum allowed value (inclusive) */
  max?: number;
  /** If true, value must be an integer (no decimals) */
  integer?: boolean;
}

export function validateNumber(
  args: Record<string, unknown>,
  field: string,
  requiredOrOptions: boolean | NumberValidationOptions = true
): number | undefined {
  const opts: NumberValidationOptions = typeof requiredOrOptions === "boolean"
    ? { required: requiredOrOptions }
    : requiredOrOptions;
  const required = opts.required ?? true;

  const value = args[field];
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`Missing required parameter: ${field}`);
    }
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Invalid parameter '${field}': expected a number, got ${typeof value}`
    );
  }
  if (opts.integer && !Number.isInteger(value)) {
    throw new Error(
      `Invalid parameter '${field}': expected an integer, got ${value}`
    );
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new Error(
      `Invalid parameter '${field}': must be >= ${opts.min}, got ${value}`
    );
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new Error(
      `Invalid parameter '${field}': must be <= ${opts.max}, got ${value}`
    );
  }
  return value;
}

export interface StringValidationOptions {
  required?: boolean;
  /** Minimum allowed length (inclusive), checked after optional trim */
  minLength?: number;
  /** Maximum allowed length (inclusive), checked after optional trim */
  maxLength?: number;
  /** If true, trim whitespace before returning and before length checks */
  trim?: boolean;
}

export function validateString(
  args: Record<string, unknown>,
  field: string,
  requiredOrOptions: boolean | StringValidationOptions = true
): string | undefined {
  const opts: StringValidationOptions =
    typeof requiredOrOptions === "boolean"
      ? { required: requiredOrOptions }
      : requiredOrOptions;
  const required = opts.required ?? true;

  const value = args[field];
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`Missing required parameter: ${field}`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(
      `Invalid parameter '${field}': expected a string, got ${typeof value}`
    );
  }

  const result = opts.trim ? value.trim() : value;

  if (opts.minLength !== undefined && result.length < opts.minLength) {
    throw new Error(
      `Invalid parameter '${field}': must be at least ${opts.minLength} ${opts.minLength === 1 ? "character" : "characters"}, got ${result.length}`
    );
  }
  if (opts.maxLength !== undefined && result.length > opts.maxLength) {
    throw new Error(
      `Invalid parameter '${field}': must be at most ${opts.maxLength} ${opts.maxLength === 1 ? "character" : "characters"}, got ${result.length}`
    );
  }

  return result;
}

export function validateEnum<T extends string>(
  args: Record<string, unknown>,
  field: string,
  validValues: readonly T[],
  required: boolean = true
): T | undefined {
  const raw = validateString(args, field, required);
  if (raw === undefined) {
    return undefined;
  }
  if (!validValues.includes(raw as T)) {
    throw new Error(
      `Invalid parameter '${field}': '${raw}'. Must be one of: ${validValues.join(
        ", "
      )}`
    );
  }
  return raw as T;
}

/**
 * Validate that a string is valid JSON. Returns the string as-is if valid.
 * Used for inputParameters fields to catch malformed JSON before sending to the API.
 */
export function validateJsonString(
  args: Record<string, unknown>,
  field: string,
  required: boolean = false
): string | undefined {
  const value = validateString(args, field, required);
  if (value === undefined) return undefined;

  try {
    JSON.parse(value);
  } catch {
    throw new Error(
      `Invalid parameter '${field}': must be a valid JSON string. Got: ${value.length > 100 ? value.substring(0, 100) + "..." : value}`
    );
  }
  return value;
}

type BooleanValidationOptions = { required?: boolean; default?: boolean };

export function validateBoolean(
  args: Record<string, unknown>,
  field: string,
  requiredOrOptions: boolean | BooleanValidationOptions = true
): boolean | undefined {
  const opts =
    typeof requiredOrOptions === "object"
      ? requiredOrOptions
      : { required: requiredOrOptions };
  const required = opts.required ?? true;
  const value = args[field];
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`Missing required parameter: ${field}`);
    }
    return opts.default;
  }
  if (typeof value !== "boolean") {
    throw new Error(
      `Invalid parameter '${field}': expected a boolean, got ${typeof value}`
    );
  }
  return value;
}

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

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Validates that a date string is in ISO 8601 format
 * @param dateStr - The date string to validate
 * @param field - The field name for error messages
 * @throws Error if the date string is missing or not in ISO 8601 format
 */
export function validateISODate(dateStr: string, field: string): void {
  if (!dateStr || dateStr.trim().length === 0) {
    throw new Error(`Missing or invalid ${field}`);
  }

  if (!ISO_DATE_REGEX.test(dateStr.trim())) {
    throw new Error(
      `Invalid date format for '${field}': expected ISO 8601 format (e.g., '2026-01-01' or '2026-01-01T00:00:00Z')`
    );
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid date format for '${field}': expected ISO 8601 format (e.g., '2026-01-01' or '2026-01-01T00:00:00Z')`
    );
  }
}

/**
 * Validates that startDate is before or equal to endDate
 * @param startDate - The start date (ISO 8601 format)
 * @param endDate - The end date (ISO 8601 format)
 * @throws Error if startDate is after endDate
 */
export function validateDateRange(startDate: string, endDate: string): void {
  if (new Date(startDate) > new Date(endDate)) {
    throw new Error("startDate must be before or equal to endDate");
  }
}

/**
 * Get default date range for billing queries (start of current month to now)
 * Uses UTC to ensure consistent behavior across different server timezones
 */
export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  return {
    startDate: startOfMonth.toISOString(),
    endDate: now.toISOString(),
  };
}
