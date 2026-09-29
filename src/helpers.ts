import { Request } from "shimmiestack";

/** Event metadata: who, where, when. */
export function metaFrom(req: Request) {
  return {
    userAgent: req.get("user-agent") ?? "unknown",
    user: req.get("x-user-id") ?? "anonymous",
    date: Date.now(),
  };
}

/** `value` must be present and a non-blank string, e.g. a venue or
 * entertainer name. Returns an error message, or undefined if valid. */
export function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? undefined
    : `${fieldName} must be a non-empty string`;
}

/** `value` must be present and a positive integer (zero not allowed), e.g. a
 * payment amount — there's no such thing as paying zero. Returns an error
 * message, or undefined if valid. */
export function requirePositiveInt(
  value: unknown,
  fieldName: string,
): string | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? undefined
    : `${fieldName} must be a positive integer`;
}

/** `value` must be present and a non-negative integer (zero allowed), e.g. a
 * fee that can be waived. Returns an error message, or undefined if valid. */
export function requireNonNegativeInt(
  value: unknown,
  fieldName: string,
): string | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? undefined
    : `${fieldName} must be a non-negative integer`;
}

/** `value` must be present and parse as an ISO-8601 datetime. Returns an
 * error message, or undefined if valid. */
export function requireIsoDate(
  value: unknown,
  fieldName: string,
): string | undefined {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? undefined
    : `${fieldName} must be an ISO-8601 datetime`;
}

/** Collects the failed validations into a plain object. (Not a Map: Maps
 * serialise to `{}` in JSON responses.) */
export function getErrors(
  validation: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(validation).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

/** Every error response has a human-readable `error`. Problems tied to a
 * request field additionally carry `errors`, keyed by field name. */
export interface ErrorResponse {
  error: string;
  errors?: Record<string, string>;
}

/** 400 body for one or more failed field validations (see getErrors). */
export function validationError(
  errors: Record<string, string>,
): ErrorResponse {
  return {
    error: `Invalid request: ${Object.keys(errors).join(", ")}`,
    errors,
  };
}

/** Body for a single problem attributed to one request field. */
export function fieldError(field: string, message: string): ErrorResponse {
  return { error: message, errors: { [field]: message } };
}
