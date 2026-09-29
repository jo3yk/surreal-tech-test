import ShimmieTestStack from "shimmiestack/shimmieteststack";
import { BookingCommand } from "../src/booking/command";
import { BookingModel } from "../src/booking/model";
import { EntertainerModel } from "../src/entertainer/model";
import { EarningsModel } from "../src/earnings/model";
import { EarningsQuery } from "../src/earnings/query";
import { RecordModels, SubscribeModels } from "../src/events";
import { PaymentModel } from "../src/payment/model";
import { VenueModel } from "../src/venue/model";

function makeStack() {
  const stack = ShimmieTestStack<RecordModels, SubscribeModels>();
  const bookingModel = BookingModel(stack);
  const venueModel = VenueModel(stack);
  const entertainerModel = EntertainerModel(stack);
  const paymentModel = PaymentModel(stack);
  const earningsModel = EarningsModel(stack);
  stack.mountTest(
    BookingCommand(stack, bookingModel, venueModel, entertainerModel, paymentModel),
    "/bookings",
  );
  stack.mountTest(EarningsQuery(earningsModel), "/entertainers");
  return { stack };
}

async function makeSeededStack() {
  const made = makeStack();
  const meta = { userAgent: "test", user: "test", date: Date.now() };
  await made.stack.recordUncheckedEvent({
    streamId: "venue-the-espy",
    eventName: "VENUE_CREATED_EVENT",
    eventData: { venueId: "the-espy", name: "The Espy", capacity: 300 },
    meta,
  });
  for (const [entertainerId, name] of [
    ["ent-1", "The Amplifiers"],
    ["ent-2", "The Others"],
  ]) {
    await made.stack.recordUncheckedEvent({
      streamId: `entertainer-${entertainerId}`,
      eventName: "ENTERTAINER_CREATED_EVENT",
      eventData: { entertainerId, name, genre: "rock" },
      meta,
    });
  }
  return made;
}

type Stack = Awaited<ReturnType<typeof makeSeededStack>>["stack"];

async function book(
  stack: Stack,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const created = await stack.testPost({
    path: "/bookings",
    body: {
      venueId: "the-espy",
      entertainerId: "ent-1",
      feeCents: 45000,
      startsAt: "2030-01-10T20:00:00.000Z",
      ...overrides,
    },
    expectedResponseCode: 201,
  });
  return created.body.bookingId;
}

const aPayment = {
  reference: "ref-1",
  amountCents: 10000,
  paidAt: "2030-01-01T09:00:00.000Z",
};

function pay(
  stack: Stack,
  bookingId: string,
  body: Record<string, unknown>,
  expectedResponseCode = 201,
) {
  return stack.testPost({
    path: `/bookings/${bookingId}/payments`,
    body,
    expectedResponseCode,
  });
}

async function earnings(stack: Stack, entertainerId = "ent-1") {
  const res = await stack.testGet({
    path: `/entertainers/${entertainerId}/earnings`,
    expectedResponseCode: 200,
  });
  return res.body;
}

describe("recording a payment", () => {
  it("should record the payment and reflect it in earnings", async () => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);

    const res = await pay(stack, bookingId, aPayment);
    expect(res.body.paymentId).toBeTruthy();

    const body = await earnings(stack);
    expect(body.totalPaidCents).toBe(10000);
    expect(body.bookings[0]).toMatchObject({
      bookingId,
      feeCents: 45000,
      paidCents: 10000,
      outstandingCents: 35000,
      status: "booked",
    });
    expect(body.bookings[0].payments).toEqual([
      { paymentId: res.body.paymentId, bookingId, ...aPayment },
    ]);
  });

  it.each([
    ["a missing reference", { reference: "" }, "reference"],
    ["a zero amount", { amountCents: 0 }, "amountCents"],
    ["a fractional amount", { amountCents: 10.5 }, "amountCents"],
    ["a negative amount", { amountCents: -5 }, "amountCents"],
    ["an invalid date", { paidAt: "yesterday-ish" }, "paidAt"],
  ])("should reject %s", async (_name, override, field) => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);

    const res = await pay(stack, bookingId, { ...aPayment, ...override }, 400);
    expect(res.body.errors[field]).toBeTruthy();

    expect((await earnings(stack)).totalPaidCents).toBe(0);
  });

  it("should return 404 for an unknown booking", async () => {
    const { stack } = await makeSeededStack();
    const res = await pay(stack, "nope", aPayment, 404);
    expect(res.body.errors.bookingId).toBeTruthy();
  });

  it("should accumulate partial payments up to the full fee", async () => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);

    await pay(stack, bookingId, { ...aPayment, amountCents: 15000 });
    await pay(stack, bookingId, {
      reference: "ref-2",
      amountCents: 30000,
      paidAt: "2030-01-11T09:00:00.000Z",
    });

    const body = await earnings(stack);
    expect(body.totalPaidCents).toBe(45000);
    expect(body.totalOutstandingCents).toBe(0);
    expect(body.bookings[0].payments).toHaveLength(2);
  });

  it("should keep an overpayment visible rather than clamping it", async () => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);

    await pay(stack, bookingId, { ...aPayment, amountCents: 50000 });

    const body = await earnings(stack);
    expect(body.bookings[0]).toMatchObject({
      paidCents: 50000,
      outstandingCents: 0,
    });
  });
});

describe("payment idempotency", () => {
  it("should treat a retry with the same reference as a no-op", async () => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);

    const first = await pay(stack, bookingId, aPayment, 201);
    const retry = await pay(stack, bookingId, aPayment, 200);
    expect(retry.body.paymentId).toBe(first.body.paymentId);

    const body = await earnings(stack);
    expect(body.totalPaidCents).toBe(10000);
    expect(body.bookings[0].payments).toHaveLength(1);
  });

  it("should treat an equivalent ISO spelling of paidAt as the same payment", async () => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);

    await pay(stack, bookingId, aPayment, 201);
    await pay(stack, bookingId, { ...aPayment, paidAt: "2030-01-01T10:00:00+01:00" }, 200);
  });

  it("should return 409 when a reference is reused for a different payment", async () => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);
    await pay(stack, bookingId, aPayment);

    const res = await pay(stack, bookingId, { ...aPayment, amountCents: 999 }, 409);
    expect(res.body.errors.reference).toBeTruthy();

    // ...including against another booking
    const other = await book(stack, { startsAt: "2030-02-01T20:00:00.000Z" });
    await pay(stack, other, aPayment, 409);

    expect((await earnings(stack)).totalPaidCents).toBe(10000);
  });
});

describe("payments against a cancelled booking", () => {
  it("should record a payment made after cancellation but owe nothing further", async () => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);
    await stack.testPost({
      path: `/bookings/${bookingId}/cancel`,
      body: { reason: "venue double-booked" },
      expectedResponseCode: 200,
    });

    await pay(stack, bookingId, aPayment, 201);

    const body = await earnings(stack);
    expect(body.totalPaidCents).toBe(10000);
    expect(body.totalOutstandingCents).toBe(0);
    expect(body.bookings[0]).toMatchObject({
      status: "cancelled",
      paidCents: 10000,
      outstandingCents: 0,
    });
  });

  it("should keep a deposit paid before cancellation", async () => {
    const { stack } = await makeSeededStack();
    const bookingId = await book(stack);
    await pay(stack, bookingId, aPayment);
    await stack.testPost({
      path: `/bookings/${bookingId}/cancel`,
      body: { reason: "band split up" },
      expectedResponseCode: 200,
    });

    const body = await earnings(stack);
    expect(body.totalPaidCents).toBe(10000);
    expect(body.bookings[0]).toMatchObject({
      status: "cancelled",
      paidCents: 10000,
      outstandingCents: 0,
    });
  });
});

describe("entertainer earnings", () => {
  it("should return 404 for an unknown entertainer", async () => {
    const { stack } = await makeSeededStack();
    const res = await stack.testGet({
      path: "/entertainers/nope/earnings",
      expectedResponseCode: 404,
    });
    expect(res.body.error).toBeTruthy();
  });

  it("should return zero totals for an entertainer with no bookings", async () => {
    const { stack } = await makeSeededStack();
    expect(await earnings(stack)).toEqual({
      entertainerId: "ent-1",
      entertainerName: "The Amplifiers",
      totalPaidCents: 0,
      totalOutstandingCents: 0,
      bookings: [],
    });
  });

  it("should total across bookings, sorted by start time, excluding other entertainers", async () => {
    const { stack } = await makeSeededStack();
    const later = await book(stack, { startsAt: "2030-03-01T20:00:00.000Z", feeCents: 20000 });
    const sooner = await book(stack, { startsAt: "2030-02-01T20:00:00.000Z", feeCents: 30000 });
    const other = await book(stack, { entertainerId: "ent-2", feeCents: 99999 });

    await pay(stack, later, { ...aPayment, reference: "a", amountCents: 5000 });
    await pay(stack, sooner, { ...aPayment, reference: "b", amountCents: 30000 });
    await pay(stack, other, { ...aPayment, reference: "c", amountCents: 1234 });

    const body = await earnings(stack);
    expect(body.bookings.map((b: { bookingId: string }) => b.bookingId)).toEqual([sooner, later]);
    expect(body.totalPaidCents).toBe(35000);
    expect(body.totalOutstandingCents).toBe(15000);

    expect((await earnings(stack, "ent-2")).totalPaidCents).toBe(1234);
  });
});
