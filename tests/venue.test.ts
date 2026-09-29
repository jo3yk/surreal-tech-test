import ShimmieTestStack from "shimmiestack/shimmieteststack";
import { BookingModel } from "../src/booking/model";
import { RecordModels, SubscribeModels } from "../src/events";
import { VenueCommand } from "../src/venue/command";
import { VenueModel } from "../src/venue/model";
import { VenueQuery } from "../src/venue/query";

function makeStack() {
  const stack = ShimmieTestStack<RecordModels, SubscribeModels>();
  const bookingModel = BookingModel(stack);
  const venueModel = VenueModel(stack);
  stack.mountTest(VenueCommand(stack), "/venues");
  stack.mountTest(VenueQuery(bookingModel, venueModel), "/venues");
  return { stack };
}

const aVenue = { name: "The Espy", capacity: 300 };

describe("creating a venue", () => {
  it("should record the venue and make it queryable", async () => {
    const { stack } = makeStack();

    const created = await stack.testPost({
      path: "/venues",
      body: aVenue,
      expectedResponseCode: 201,
    });
    const { venueId } = created.body;
    expect(venueId).toBeTruthy();

    const fetched = await stack.testGet({
      path: `/venues/${venueId}`,
      expectedResponseCode: 200,
    });
    expect(fetched.body).toEqual({ venueId, ...aVenue });
  });

  it("should give each venue a distinct id", async () => {
    const { stack } = makeStack();

    const first = await stack.testPost({
      path: "/venues",
      body: aVenue,
      expectedResponseCode: 201,
    });
    const second = await stack.testPost({
      path: "/venues",
      body: { name: "The Corner", capacity: 80 },
      expectedResponseCode: 201,
    });
    expect(first.body.venueId).not.toBe(second.body.venueId);

    const fetched = await stack.testGet({
      path: `/venues/${second.body.venueId}`,
      expectedResponseCode: 200,
    });
    expect(fetched.body.name).toBe("The Corner");
  });
});

describe("validating a new venue", () => {
  it.each([
    ["a missing name", { capacity: 300 }, "name"],
    ["a blank name", { ...aVenue, name: "   " }, "name"],
    ["a non-string name", { ...aVenue, name: 42 }, "name"],
    ["a missing capacity", { name: "The Espy" }, "capacity"],
    ["a zero capacity", { ...aVenue, capacity: 0 }, "capacity"],
    ["a negative capacity", { ...aVenue, capacity: -5 }, "capacity"],
    ["a fractional capacity", { ...aVenue, capacity: 10.5 }, "capacity"],
    ["a string capacity", { ...aVenue, capacity: "100" }, "capacity"],
  ])("should reject %s", async (_label, body, field) => {
    const { stack } = makeStack();
    const res = await stack.testPost({
      path: "/venues",
      body,
      expectedResponseCode: 400,
    });
    expect(res.body.errors[field]).toBeTruthy();
  });

  it("should report every invalid field at once", async () => {
    const { stack } = makeStack();
    const res = await stack.testPost({
      path: "/venues",
      body: { name: "", capacity: 0 },
      expectedResponseCode: 400,
    });
    expect(Object.keys(res.body.errors).sort()).toEqual(["capacity", "name"]);
  });
});

describe("fetching a venue", () => {
  it("should return 404 when the venue does not exist", async () => {
    const { stack } = makeStack();
    const res = await stack.testGet({
      path: "/venues/not-a-real-venue",
      expectedResponseCode: 404,
    });
    expect(res.body.error).toContain("not-a-real-venue");
  });
});
