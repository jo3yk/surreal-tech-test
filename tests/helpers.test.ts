import {
  fieldError,
  getErrors,
  metaFrom,
  requireIsoDate,
  requireNonEmptyString,
  requireNonNegativeInt,
  requirePositiveInt,
  validationError,
} from "../src/helpers";

describe("error response builders", () => {
  it("should summarise failed fields in error and keep the map", () => {
    const errors = { name: "name must be a non-empty string", capacity: "bad" };
    expect(validationError(errors)).toEqual({
      error: "Invalid request: name, capacity",
      errors,
    });
  });

  it("should mirror a single field message into both keys", () => {
    expect(fieldError("venueId", "Unknown venue x")).toEqual({
      error: "Unknown venue x",
      errors: { venueId: "Unknown venue x" },
    });
  });

  it("should collect only the failed validations", () => {
    expect(getErrors({ a: undefined, b: "bad", c: undefined })).toEqual({ b: "bad" });
    expect(getErrors({ a: undefined })).toEqual({});
  });
});

describe("validators", () => {
  it.each([
    [requireNonEmptyString, "x", true],
    [requireNonEmptyString, "", false],
    [requireNonEmptyString, "   ", false],
    [requireNonEmptyString, 5, false],
    [requireNonEmptyString, undefined, false],
    [requirePositiveInt, 1, true],
    [requirePositiveInt, 0, false],
    [requirePositiveInt, -1, false],
    [requirePositiveInt, 1.5, false],
    [requirePositiveInt, NaN, false],
    [requirePositiveInt, Infinity, false],
    [requirePositiveInt, "1", false],
    [requireNonNegativeInt, 0, true],
    [requireNonNegativeInt, 7, true],
    [requireNonNegativeInt, -1, false],
    [requireNonNegativeInt, 0.5, false],
    [requireNonNegativeInt, NaN, false],
    [requireNonNegativeInt, Infinity, false],
    [requireNonNegativeInt, null, false],
    [requireIsoDate, "2030-01-10T20:00:00.000Z", true],
    [requireIsoDate, "2030-01-10T20:00:00+11:00", true],
    [requireIsoDate, "not-a-date", false],
    [requireIsoDate, "", false],
    [requireIsoDate, 1893456000000, false],
    [requireIsoDate, undefined, false],
  ] as const)("%p(%p) valid=%p", (validator, value, valid) => {
    const result = validator(value, "field");
    if (valid) {
      expect(result).toBeUndefined();
    } else {
      expect(result).toContain("field");
    }
  });
});

describe("metaFrom", () => {
  const reqWith = (headers: Record<string, string>) =>
    ({ get: (name: string) => headers[name] }) as any;

  it("should read the user agent and user from headers", () => {
    const meta = metaFrom(reqWith({ "user-agent": "curl", "x-user-id": "jo" }));
    expect(meta).toMatchObject({ userAgent: "curl", user: "jo" });
    expect(typeof meta.date).toBe("number");
  });

  it("should fall back to unknown and anonymous", () => {
    expect(metaFrom(reqWith({}))).toMatchObject({
      userAgent: "unknown",
      user: "anonymous",
    });
  });
});
