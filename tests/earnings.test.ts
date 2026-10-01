import ShimmieTestStack from "shimmiestack/shimmieteststack";
import { EarningsModel } from "../src/earnings/model";
import { RecordModels, SubscribeModels } from "../src/events";

const meta = { userAgent: "test", user: "test", date: Date.now() };

function makeStack() {
  const stack = ShimmieTestStack<RecordModels, SubscribeModels>();
  const earnings = EarningsModel(stack);
  return { stack, earnings };
}

type Stack = ReturnType<typeof makeStack>["stack"];

const entertainerCreated = (stack: Stack) =>
  stack.recordUncheckedEvent({
    streamId: "entertainer-ent-1",
    eventName: "ENTERTAINER_CREATED_EVENT",
    eventData: { entertainerId: "ent-1", name: "The Amplifiers", genre: "rock" },
    meta,
  });

const bookingConfirmed = (
  stack: Stack,
  overrides: { bookingId?: string; feeCents?: number; startsAt?: string } = {},
) => {
  const bookingId = overrides.bookingId ?? "b1";
  return stack.recordUncheckedEvent({
    streamId: `booking-${bookingId}`,
    eventName: "BOOKING_CONFIRMED_EVENT",
    eventData: {
      bookingId,
      venueId: "v1",
      entertainerId: "ent-1",
      entertainerName: "The Amplifiers",
      feeCents: 45000,
      startsAt: "2030-01-10T20:00:00.000Z",
      ...overrides,
    },
    meta,
  });
};

const paymentRecorded = (
  stack: Stack,
  paymentId: string,
  amountCents: number,
  bookingId = "b1",
) =>
  stack.recordUncheckedEvent({
    streamId: `payment-${paymentId}`,
    eventName: "PAYMENT_RECORDED_EVENT",
    eventData: {
      paymentId,
      reference: `ref-${paymentId}`,
      bookingId,
      amountCents,
      paidAt: "2030-01-01T09:00:00.000Z",
    },
    meta,
  });

const bookingCancelled = (stack: Stack) =>
  stack.recordUncheckedEvent({
    streamId: "booking-b1",
    eventName: "BOOKING_CANCELLED_EVENT",
    eventData: { bookingId: "b1", reason: "test" },
    meta,
  });

describe("earnings model event handling", () => {
  it("should return undefined for an unknown entertainer", () => {
    const { earnings } = makeStack();
    expect(earnings.getEarnings("ent-1")).toBeUndefined();
  });

  it("should give the same result whether a payment event arrives before or after its booking", async () => {
    const inOrder = makeStack();
    await entertainerCreated(inOrder.stack);
    await bookingConfirmed(inOrder.stack);
    await paymentRecorded(inOrder.stack, "p1", 10000);

    const reversed = makeStack();
    await entertainerCreated(reversed.stack);
    await paymentRecorded(reversed.stack, "p1", 10000);
    await bookingConfirmed(reversed.stack);

    expect(reversed.earnings.getEarnings("ent-1")).toEqual(
      inOrder.earnings.getEarnings("ent-1"),
    );
    expect(inOrder.earnings.getEarnings("ent-1")?.totalPaidCents).toBe(10000);
  });

  it("should ignore a payment for a booking it has never seen", async () => {
    const { stack, earnings } = makeStack();
    await entertainerCreated(stack);
    await paymentRecorded(stack, "p1", 10000);

    expect(earnings.getEarnings("ent-1")?.totalPaidCents).toBe(0);
  });

  it("should skip a cancellation for an unknown booking without throwing", async () => {
    const { stack, earnings } = makeStack();
    await entertainerCreated(stack);
    await bookingCancelled(stack);

    expect(earnings.getEarnings("ent-1")?.bookings).toEqual([]);
  });

  it("should count a payment recorded before the cancellation event", async () => {
    const { stack, earnings } = makeStack();
    await entertainerCreated(stack);
    await bookingConfirmed(stack);
    await paymentRecorded(stack, "p1", 10000);
    await bookingCancelled(stack);

    const result = earnings.getEarnings("ent-1");
    expect(result?.totalPaidCents).toBe(10000);
    expect(result?.totalOutstandingCents).toBe(0);
    expect(result?.bookings[0].status).toBe("cancelled");
  });

  it("should total outstanding across bookings, excluding cancelled ones", async () => {
    const { stack, earnings } = makeStack();
    await entertainerCreated(stack);
    await bookingConfirmed(stack); // b1: 45000, cancelled below
    await bookingConfirmed(stack, { bookingId: "b2", feeCents: 20000 });
    await paymentRecorded(stack, "p1", 5000);
    await paymentRecorded(stack, "p2", 5000, "b2");
    await bookingCancelled(stack);

    const result = earnings.getEarnings("ent-1");
    expect(result?.totalPaidCents).toBe(10000);
    expect(result?.totalOutstandingCents).toBe(15000);
  });

  it("should handle a waived (zero) fee", async () => {
    const { stack, earnings } = makeStack();
    await entertainerCreated(stack);
    await bookingConfirmed(stack, { feeCents: 0 });

    expect(earnings.getEarnings("ent-1")?.bookings[0]).toMatchObject({
      feeCents: 0,
      paidCents: 0,
      outstandingCents: 0,
    });
  });

  it("should not double-count a booking confirmed twice with the same id", async () => {
    const { stack, earnings } = makeStack();
    await entertainerCreated(stack);
    await bookingConfirmed(stack);
    await bookingConfirmed(stack);

    const result = earnings.getEarnings("ent-1");
    expect(result?.bookings).toHaveLength(1);
    expect(result?.totalOutstandingCents).toBe(45000);
  });

  it("should order bookings by instant, not by string, across offsets", async () => {
    const { stack, earnings } = makeStack();
    await entertainerCreated(stack);
    await bookingConfirmed(stack, { bookingId: "late", startsAt: "2030-01-10T09:30:00.000Z" });
    await bookingConfirmed(stack, { bookingId: "early", startsAt: "2030-01-10T20:00:00+11:00" });

    expect(earnings.getEarnings("ent-1")?.bookings.map((b) => b.bookingId)).toEqual([
      "early",
      "late",
    ]);
  });

  it("should return undefined when bookings exist but the entertainer was never created", async () => {
    const { stack, earnings } = makeStack();
    await bookingConfirmed(stack);

    expect(earnings.getEarnings("ent-1")).toBeUndefined();
  });

  it("should not let callers mutate the model through returned payments", async () => {
    const { stack, earnings } = makeStack();
    await entertainerCreated(stack);
    await bookingConfirmed(stack);
    await paymentRecorded(stack, "p1", 10000);

    earnings.getEarnings("ent-1")!.bookings[0].payments.pop();

    expect(earnings.getEarnings("ent-1")?.totalPaidCents).toBe(10000);
  });
});
