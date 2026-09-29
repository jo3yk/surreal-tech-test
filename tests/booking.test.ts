import ShimmieTestStack from "shimmiestack/shimmieteststack";
import { BookingCommand } from "../src/booking/command";
import { BookingModel } from "../src/booking/model";
import { BookingQuery } from "../src/booking/query";
import { RecordModels, SubscribeModels } from "../src/events";
import { VenueQuery } from "../src/venue/query";
import { EntertainerModel } from "../src/entertainer/model";
import { VenueModel } from "../src/venue/model";

function makeStack() {
  const stack = ShimmieTestStack<RecordModels, SubscribeModels>();
  const bookingModel = BookingModel(stack);
  const venueModel = VenueModel(stack);
  const entertainerModel = EntertainerModel(stack);
  stack.mountTest(BookingCommand(stack, bookingModel, venueModel, entertainerModel), "/bookings");
  stack.mountTest(BookingQuery(bookingModel), "/bookings");
  stack.mountTest(VenueQuery(bookingModel, venueModel), "/venues");
  return { stack, bookingModel };
}

/** Bookings must reference a known venue and entertainer, so seed them. */
async function makeSeededStack() {
  const made = makeStack();
  const meta = { userAgent: "test", user: "test", date: Date.now() };
  await made.stack.recordUncheckedEvent({
    streamId: "venue-the-espy",
    eventName: "VENUE_CREATED_EVENT",
    eventData: { venueId: "the-espy", name: "The Espy", capacity: 300 },
    meta,
  });
  await made.stack.recordUncheckedEvent({
    streamId: "venue-some-other-venue",
    eventName: "VENUE_CREATED_EVENT",
    eventData: { venueId: "some-other-venue", name: "Elsewhere", capacity: 100 },
    meta,
  });
  await made.stack.recordUncheckedEvent({
    streamId: "entertainer-ent-1",
    eventName: "ENTERTAINER_CREATED_EVENT",
    eventData: { entertainerId: "ent-1", name: "The Amplifiers", genre: "rock" },
    meta,
  });
  return made;
}

const aBooking = {
  venueId: "the-espy",
  entertainerId: "ent-1",
  feeCents: 45000,
  startsAt: "2030-01-10T20:00:00.000Z",
};

describe("confirming a booking", () => {
  it("should record the booking and make it queryable", async () => {
    const { stack } = await makeSeededStack();

    const created = await stack.testPost({
      path: "/bookings",
      body: aBooking,
      expectedResponseCode: 201,
    });
    const { bookingId } = created.body;
    expect(bookingId).toBeTruthy();

    const fetched = await stack.testGet({
      path: `/bookings/${bookingId}`,
      expectedResponseCode: 200,
    });
    expect(fetched.body.booking).toMatchObject({
      bookingId,
      entertainerId: "ent-1",
      startsAt: "2030-01-10T20:00:00.000Z",
      venueId: "the-espy",
      entertainerName: "The Amplifiers",
      feeCents: 45000,
      status: "booked",
    });
  });

  it("should reject a booking with a missing fee", async () => {
    const { stack } = await makeSeededStack();
    const { feeCents, ...noFee } = aBooking;
    const res = await stack.testPost({
      path: "/bookings",
      body: noFee,
      expectedResponseCode: 400,
    });
    expect(res.body.errors.feeCents).toBeTruthy();
  });

  it("should return 404 for an unknown venue", async () => {
    const { stack } = await makeSeededStack();
    const res = await stack.testPost({
      path: "/bookings",
      body: { ...aBooking, venueId: "nowhere" },
      expectedResponseCode: 404,
    });
    expect(res.body.errors.venueId).toContain("nowhere");
  });

  it("should return 404 for an unknown entertainer", async () => {
    const { stack } = await makeSeededStack();
    const res = await stack.testPost({
      path: "/bookings",
      body: { ...aBooking, entertainerId: "nobody" },
      expectedResponseCode: 404,
    });
    expect(res.body.errors.entertainerId).toContain("nobody");
  });

  it("should list upcoming bookings for a venue, soonest first", async () => {
    const { stack } = await makeSeededStack();

    await stack.testPost({
      path: "/bookings",
      body: { ...aBooking, startsAt: "2030-03-01T20:00:00.000Z" },
      expectedResponseCode: 201,
    });
    await stack.testPost({
      path: "/bookings",
      body: { ...aBooking, startsAt: "2030-02-01T19:00:00.000Z" },
      expectedResponseCode: 201,
    });
    await stack.testPost({
      path: "/bookings",
      body: { ...aBooking, venueId: "some-other-venue" },
      expectedResponseCode: 201,
    });

    const list = await stack.testGet({
      path: "/venues/the-espy/bookings",
      expectedResponseCode: 200,
    });
    expect(list.body.bookings).toHaveLength(2);
    expect(list.body.bookings[0].startsAt).toBe("2030-02-01T19:00:00.000Z");
  });
});

describe("cancelling a booking", () => {
  it("should cancel an existing booking and remove it from the venue upcoming list", async () => {
    const { stack } = await makeSeededStack();

    const created = await stack.testPost({
      path: "/bookings",
      body: aBooking,
      expectedResponseCode: 201,
    });
    const { bookingId } = created.body;

    await stack.testPost({
      path: `/bookings/${bookingId}/cancel`,
      body: { reason: "venue double-booked" },
      expectedResponseCode: 200,
    });

    const fetched = await stack.testGet({
      path: `/bookings/${bookingId}`,
      expectedResponseCode: 200,
    });
    expect(fetched.body.booking.status).toBe("cancelled");
    expect(fetched.body.booking.cancelledReason).toBe("venue double-booked");

    const list = await stack.testGet({
      path: "/venues/the-espy/bookings",
      expectedResponseCode: 200,
    });
    expect(list.body.bookings).toHaveLength(0);
  });

  it("should return 404 when cancelling a booking that does not exist", async () => {
    const { stack } = await makeSeededStack();
    await stack.testPost({
      path: "/bookings/not-a-real-booking/cancel",
      body: { reason: "why not" },
      expectedResponseCode: 404,
    });
  });

  it("should return 409 when cancelling a booking twice", async () => {
    const { stack } = await makeSeededStack();

    const created = await stack.testPost({
      path: "/bookings",
      body: aBooking,
      expectedResponseCode: 201,
    });
    const { bookingId } = created.body;

    await stack.testPost({
      path: `/bookings/${bookingId}/cancel`,
      body: { reason: "first" },
      expectedResponseCode: 200,
    });
    await stack.testPost({
      path: `/bookings/${bookingId}/cancel`,
      body: { reason: "second" },
      expectedResponseCode: 409,
    });
  });
});
