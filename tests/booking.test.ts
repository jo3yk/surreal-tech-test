import ShimmieTestStack from "shimmiestack/shimmieteststack";
import { BookingCommand } from "../src/booking/command";
import { BookingModel } from "../src/booking/model";
import { BookingQuery } from "../src/booking/query";
import { RecordModels, SubscribeModels } from "../src/events";
import { VenueQuery } from "../src/venue/query";

function makeStack() {
  const stack = ShimmieTestStack<RecordModels, SubscribeModels>();
  const bookingModel = BookingModel(stack);
  stack.mountTest(BookingCommand(stack, bookingModel), "/bookings");
  stack.mountTest(BookingQuery(bookingModel), "/bookings");
  stack.mountTest(VenueQuery(bookingModel), "/venues");
  return { stack, bookingModel };
}

const aBooking = {
  venueId: "the-espy",
  entertainerId: "ent-1",
  entertainerName: "The Amplifiers",
  feeCents: 45000,
  startsAt: "2030-01-10T20:00:00.000Z",
};

describe("confirming a booking", () => {
  it("should record the booking and make it queryable", async () => {
    const { stack } = makeStack();

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
    const { stack } = makeStack();
    const { feeCents, ...noFee } = aBooking;
    await stack.testPost({
      path: "/bookings",
      body: noFee,
      expectedResponseCode: 400,
    });
  });

  it("should list upcoming bookings for a venue, soonest first", async () => {
    const { stack } = makeStack();

    await stack.testPost({
      path: "/bookings",
      body: { ...aBooking, startsAt: "2030-03-01T20:00:00.000Z" },
      expectedResponseCode: 201,
    });
    await stack.testPost({
      path: "/bookings",
      body: {
        ...aBooking,
        entertainerName: "Trivia Tim",
        startsAt: "2030-02-01T19:00:00.000Z",
      },
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
    expect(list.body.bookings[0].entertainerName).toBe("Trivia Tim");
  });
});

describe("cancelling a booking", () => {
  it("should cancel an existing booking and remove it from the venue upcoming list", async () => {
    const { stack } = makeStack();

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
    const { stack } = makeStack();
    await stack.testPost({
      path: "/bookings/not-a-real-booking/cancel",
      body: { reason: "why not" },
      expectedResponseCode: 404,
    });
  });

  it("should return 409 when cancelling a booking twice", async () => {
    const { stack } = makeStack();

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
