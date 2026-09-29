/** Earnings read model. Rebuilt from the event log on startup.
 *
 * Subscribes to booking, payment and entertainer events itself rather than
 * composing the other models, so it depends on nothing but the event log.
 * Payments are indexed by bookingId and joined to bookings at read time, so
 * the result doesn't depend on event order.
 *
 * Payments against cancelled bookings: we record and count them (there's no
 * status check on the payment endpoint — see booking/command.ts). A payment
 * is a fact about money that already moved (e.g. a deposit paid before the
 * gig was cancelled); refusing to record it would make the ledger disagree
 * with the bank. So a cancelled booking keeps its paidCents, still counts
 * towards totalPaidCents, and has outstandingCents = 0 because the fee is no
 * longer owed. Returning the money is a separate event for future implementation.
 */
import { StackType } from "shimmiestack";
import { RecordModels, SubscribeModels } from "../events";
import { Booking, BookingStatus } from "../booking/model";
import { Payment } from "../payment/model";

export interface BookingEarnings {
  bookingId: string;
  venueId: string;
  startsAt: string;
  status: BookingStatus;
  feeCents: number;
  paidCents: number;
  /** Fee still owed. 0 once cancelled or paid in full (an overpayment
   * stays visible in paidCents rather than being clamped). */
  outstandingCents: number;
  payments: Payment[];
}

export interface EntertainerEarnings {
  entertainerId: string;
  entertainerName: string;
  totalPaidCents: number;
  totalOutstandingCents: number;
  /** Sorted by startsAt. */
  bookings: BookingEarnings[];
}

/** The part of a Booking that earnings needs. */
type BookingRow = Pick<
  Booking,
  | "bookingId"
  | "entertainerId"
  | "venueId"
  | "startsAt"
  | "feeCents"
  | "status"
>;

export function EarningsModel(stack: StackType<RecordModels, SubscribeModels>) {
  const entertainerNames = new Map<string, string>();
  const bookingsById = new Map<string, BookingRow>();
  const bookingIdsByEntertainer = new Map<string, string[]>();
  const paymentsByBookingId = new Map<string, Payment[]>();

  stack.subscribe("ENTERTAINER_CREATED_EVENT", (event) => {
    entertainerNames.set(event.data.entertainerId, event.data.name);
  });

  stack.subscribe("BOOKING_CONFIRMED_EVENT", (event) => {
    const { bookingId, entertainerId, venueId, startsAt, feeCents } = event.data;
    bookingsById.set(bookingId, {
      bookingId,
      entertainerId,
      venueId,
      startsAt,
      feeCents,
      status: "booked",
    });
    const ids = bookingIdsByEntertainer.get(entertainerId) ?? [];
    ids.push(bookingId);
    bookingIdsByEntertainer.set(entertainerId, ids);
  });

  stack.subscribe("BOOKING_CANCELLED_EVENT", (event) => {
    const booking = bookingsById.get(event.data.bookingId);
    if (!booking) {
      // Unknown booking on replay — skip rather than throw.
      return;
    }
    booking.status = "cancelled";
  });

  stack.subscribe("PAYMENT_RECORDED_EVENT", (event) => {
    const { paymentId, reference, bookingId, amountCents, paidAt } = event.data;
    const payments = paymentsByBookingId.get(bookingId) ?? [];
    payments.push({ paymentId, reference, bookingId, amountCents, paidAt });
    paymentsByBookingId.set(bookingId, payments);
  });

  const toBookingEarnings = (booking: BookingRow): BookingEarnings => {
    const payments = paymentsByBookingId.get(booking.bookingId) ?? [];
    const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
    const outstandingCents =
      booking.status === "cancelled"
        ? 0
        : Math.max(booking.feeCents - paidCents, 0);
    return {
      bookingId: booking.bookingId,
      venueId: booking.venueId,
      startsAt: booking.startsAt,
      status: booking.status,
      feeCents: booking.feeCents,
      paidCents,
      outstandingCents,
      payments: [...payments],
    };
  };

  return {
    /** Undefined if the entertainer is unknown. */
    getEarnings: (entertainerId: string): EntertainerEarnings | undefined => {
      const entertainerName = entertainerNames.get(entertainerId);
      if (entertainerName === undefined) {
        return undefined;
      }
      const bookings = (bookingIdsByEntertainer.get(entertainerId) ?? [])
        .map((id) => toBookingEarnings(bookingsById.get(id)!))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return {
        entertainerId,
        entertainerName,
        totalPaidCents: bookings.reduce((sum, b) => sum + b.paidCents, 0),
        totalOutstandingCents: bookings.reduce(
          (sum, b) => sum + b.outstandingCents,
          0,
        ),
        bookings,
      };
    },
  };
}

export type EarningsModelType = ReturnType<typeof EarningsModel>;
