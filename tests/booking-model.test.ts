import ShimmieTestStack from "shimmiestack/shimmieteststack";
import { BookingModel } from "../src/booking/model";
import { RecordModels, SubscribeModels } from "../src/events";

const meta = { userAgent: "test", user: "test", date: Date.now() };

function makeStack() {
  const stack = ShimmieTestStack<RecordModels, SubscribeModels>();
  const bookings = BookingModel(stack);
  return { stack, bookings };
}

type Stack = ReturnType<typeof makeStack>["stack"];

const confirm = (stack: Stack, bookingId: string, startsAt: string) =>
  stack.recordUncheckedEvent({
    streamId: `booking-${bookingId}`,
    eventName: "BOOKING_CONFIRMED_EVENT",
    eventData: {
      bookingId,
      venueId: "v1",
      entertainerId: "ent-1",
      entertainerName: "The Amplifiers",
      feeCents: 1000,
      startsAt,
    },
    meta,
  });

const cancel = (stack: Stack, bookingId: string, reason = "test") =>
  stack.recordUncheckedEvent({
    streamId: `booking-${bookingId}`,
    eventName: "BOOKING_CANCELLED_EVENT",
    eventData: { bookingId, reason },
    meta,
  });

describe("booking model", () => {
  it("should skip a cancellation for an unknown booking without throwing", async () => {
    const { stack, bookings } = makeStack();
    await cancel(stack, "ghost");

    expect(bookings.getBooking("ghost")).toBeUndefined();
  });

  it("should record the cancellation reason and status", async () => {
    const { stack, bookings } = makeStack();
    await confirm(stack, "b1", "2030-01-10T20:00:00.000Z");
    await cancel(stack, "b1", "venue flooded");

    expect(bookings.getBooking("b1")).toMatchObject({
      status: "cancelled",
      cancelledReason: "venue flooded",
    });
  });

  it("should default the upcoming cutoff to now", async () => {
    const { stack, bookings } = makeStack();
    await confirm(stack, "past", "2000-01-01T00:00:00.000Z");
    await confirm(stack, "future", "2999-01-01T00:00:00.000Z");

    expect(bookings.getUpcomingBookingsForVenue("v1").map((b) => b.bookingId)).toEqual([
      "future",
    ]);
  });
});
