/**
 * Measures what the in-memory read models cost as the event log grows:
 *  - heap used by each model once it has folded N bookings' worth of events
 *  - time for the "upcoming bookings for a venue" query (scans every booking)
 *  - time for an entertainer earnings query
 *
 * It feeds the real models straight from a generator, so no event base is
 * involved and nothing but the models holds memory. Run via:
 *   npm run bench:models -- --bookings 1.6M
 * Options (counts accept k/M suffixes):
 *   --bookings 1.6M           bookings to create (default 1M)
 *   --payments-per-booking 1  average payments per booking (default 1)
 *   --cancel-rate 0.05        share of bookings cancelled (default 0.05)
 *   --venues 2000             distinct venues (default 2000)
 *   --entertainers 5000       distinct entertainers (default 5000)
 * Stops early, and says so, if the heap gets close to V8's limit. Raise the
 * limit with NODE_OPTIONS=--max-old-space-size=<MB> (see LOAD_TEST.md).
 */
import { randomUUID } from "crypto";
import { getHeapStatistics } from "v8";
import { StackType } from "shimmiestack";
import { BookingModel } from "../src/booking/model";
import { EarningsModel } from "../src/earnings/model";
import { PaymentModel } from "../src/payment/model";
import { RecordModels, SubscribeModels } from "../src/events";

type Stack = StackType<RecordModels, SubscribeModels>;
type Handler = (event: { data: any }) => void;
type Event = { type: string; data: Record<string, unknown> };

function parseCount(value: string): number {
  const m = /^([\d.]+)([kKmM]?)$/.exec(value);
  if (!m) throw new Error(`Bad number "${value}"`);
  return Math.round(Number(m[1]) * ({ "": 1, k: 1e3, m: 1e6 }[m[2].toLowerCase()] as number));
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const bookings = parseCount(arg("bookings", "1M"));
const paymentsPerBooking = Number(arg("payments-per-booking", "1"));
const cancelRate = Number(arg("cancel-rate", "0.05"));
const venueCount = parseCount(arg("venues", "2000"));
const entertainerCount = parseCount(arg("entertainers", "5000"));

if (!global.gc) {
  console.error("Run with --expose-gc (use `npm run bench:models`).");
  process.exit(1);
}

// Small seeded PRNG so runs are comparable.
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const venueIds = Array.from({ length: venueCount }, () => randomUUID());
const entertainerIds = Array.from({ length: entertainerCount }, () => randomUUID());
const BASE_DATE = Date.UTC(2020, 0, 1);
const SPAN_MS = 8 * 365 * 864e5; // ~8 years of gigs, like the real history

/** Entertainers first (earnings needs their names), then each booking:
 * confirmed, payments, then maybe a cancel. */
function* bookingEvents(): Generator<Event> {
  for (let i = 0; i < entertainerCount; i++) {
    yield {
      type: "ENTERTAINER_CREATED_EVENT",
      data: { entertainerId: entertainerIds[i], name: `Entertainer ${i}`, genre: "rock" },
    };
  }
  for (let i = 0; i < bookings; i++) {
    const bookingId = randomUUID();
    const startsAt = new Date(BASE_DATE + rand() * SPAN_MS).toISOString();
    const entertainerIdx = Math.floor(rand() * entertainerCount);
    yield {
      type: "BOOKING_CONFIRMED_EVENT",
      data: {
        bookingId,
        venueId: venueIds[Math.floor(rand() * venueCount)],
        entertainerId: entertainerIds[entertainerIdx],
        entertainerName: `Entertainer ${entertainerIdx}`,
        feeCents: 20000 + Math.floor(rand() * 200000),
        startsAt,
      },
    };
    const payments = Math.floor(paymentsPerBooking) + (rand() < paymentsPerBooking % 1 ? 1 : 0);
    for (let p = 0; p < payments; p++) {
      yield {
        type: "PAYMENT_RECORDED_EVENT",
        data: {
          paymentId: randomUUID(),
          reference: randomUUID(),
          bookingId,
          amountCents: 10000 + Math.floor(rand() * 100000),
          paidAt: startsAt,
        },
      };
    }
    if (rand() < cancelRate) {
      yield { type: "BOOKING_CANCELLED_EVENT", data: { bookingId, reason: "cancelled by venue" } };
    }
  }
}

/** The models only call stack.subscribe, so a tiny fake is enough. */
function fakeStack() {
  const handlers = new Map<string, Handler[]>();
  const stack = {
    subscribe: (type: string, fn: Handler) => {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
    },
  } as unknown as Stack;
  const dispatch = (e: Event) => handlers.get(e.type)?.forEach((fn) => fn({ data: e.data }));
  return { stack, dispatch };
}

/** Settled heap reading. A single gc() doesn't always finish freeing (V8 sweeps
 * concurrently), which skews the before/after delta, so GC a few times with
 * short pauses. */
const heapUsed = async () => {
  for (let i = 0; i < 3; i++) {
    global.gc!();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return process.memoryUsage().heapUsed;
};
const mb = (bytes: number) => bytes / 1048576;
const limitBytes = getHeapStatistics().heap_size_limit;

/** Folds every event into a fresh model; returns what it cost. */
async function measure<M>(build: (stack: Stack) => M) {
  const before = await heapUsed();
  const { stack, dispatch } = fakeStack();
  const model = build(stack);
  let events = 0;
  let bookingsDone = 0;
  let stoppedEarly = false;
  for (const e of bookingEvents()) {
    dispatch(e);
    events++;
    if (e.type === "BOOKING_CONFIRMED_EVENT") bookingsDone++;
    if (events % 100_000 === 0 && process.memoryUsage().heapUsed > limitBytes * 0.85) {
      stoppedEarly = true;
      break;
    }
  }
  return { model, events, bookingsDone, stoppedEarly, heapMb: mb((await heapUsed()) - before) };
}

function timeMs(fn: () => unknown, runs = 5): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

async function main() {
  console.log(
    `bookings=${bookings.toLocaleString()} paymentsPerBooking=${paymentsPerBooking} cancelRate=${cancelRate} ` +
      `venues=${venueCount} entertainers=${entertainerCount} heapLimit=${Math.round(mb(limitBytes))}MB\n`,
  );

  const rows: string[][] = [["model", "bookings folded", "events", "heap MB", "bytes/booking"]];
  const note = (r: { stoppedEarly: boolean }) =>
    r.stoppedEarly ? " (stopped: heap limit)" : "";

  const b = await measure(BookingModel);
  rows.push(["BookingModel", b.bookingsDone.toLocaleString() + note(b), b.events.toLocaleString(), b.heapMb.toFixed(0), String(Math.round((b.heapMb * 1048576) / b.bookingsDone))]);
  const venue = venueIds[0];
  const mid = new Date(BASE_DATE + SPAN_MS / 2);
  const scanMs = timeMs(() => b.model.getUpcomingBookingsForVenue(venue, mid));
  const scanHits = b.model.getUpcomingBookingsForVenue(venue, mid).length;
  // Drop the booking model before building the next one so heap deltas don't overlap.
  (b as { model: unknown }).model = undefined;

  const e = await measure(EarningsModel);
  rows.push(["EarningsModel", e.bookingsDone.toLocaleString() + note(e), e.events.toLocaleString(), e.heapMb.toFixed(0), String(Math.round((e.heapMb * 1048576) / e.bookingsDone))]);
  const earningsMs = timeMs(() => e.model.getEarnings(entertainerIds[0]));
  const earningsBookings = e.model.getEarnings(entertainerIds[0])?.bookings.length ?? 0;
  (e as { model: unknown }).model = undefined;

  const p = await measure(PaymentModel);
  rows.push(["PaymentModel", p.bookingsDone.toLocaleString() + note(p), p.events.toLocaleString(), p.heapMb.toFixed(0), String(Math.round((p.heapMb * 1048576) / p.bookingsDone))]);

  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join("  "));
  if (b.stoppedEarly || e.stoppedEarly || p.stoppedEarly) {
    console.log(
      "\nStopped early at the heap limit, so the models didn't see every booking and the totals aren't comparable. " +
        "Raise it with NODE_OPTIONS=--max-old-space-size=<MB>, or use a smaller --bookings.",
    );
  } else {
    console.log(
      `\nAll three models together: ~${(b.heapMb + e.heapMb + p.heapMb).toFixed(0)} MB (measured separately, so additive).`,
    );
  }
  console.log(
    `Venue "upcoming bookings" query (scans all ${b.bookingsDone.toLocaleString()} bookings it holds): ${scanMs.toFixed(1)} ms median, ${scanHits} results.`,
  );
  console.log(
    `Entertainer earnings query: ${earningsMs.toFixed(2)} ms median, ${earningsBookings} bookings returned.`,
  );
}

main();
