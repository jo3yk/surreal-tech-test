import { fieldError, validationError } from "../src/helpers";

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
});
