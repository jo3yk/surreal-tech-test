/** In-memory read/command model. Rebuilt from the event log on startup. */
import { StackType } from "shimmiestack";
import { RecordModels, SubscribeModels } from "../events";
import { Payment } from "../payment/model";

export type BookingStatus = "booked" | "cancelled";

export interface Booking {
  bookingId: string;
  venueId: string;
  entertainerId: string;
  entertainerName: string;
  feeCents: number;
  startsAt: string;
  status: BookingStatus;
  cancelledReason?: string;
}

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

export function BookingModel(stack: StackType<RecordModels, SubscribeModels>) {
  /** In our real code base - state is stored in an in-memory SQLite database
   * in models we call 'kahunas' */
  const bookingsById = new Map<string, Booking>();

  const upsertBooking = (booking: Booking) => {
    bookingsById.set(booking.bookingId, booking);
  };

  stack.subscribe("BOOKING_CONFIRMED_EVENT", (event) => {
    const {
      bookingId,
      venueId,
      entertainerId,
      entertainerName,
      feeCents,
      startsAt,
    } = event.data;
    upsertBooking({
      bookingId,
      venueId,
      entertainerId,
      entertainerName,
      feeCents,
      startsAt,
      status: "booked",
    });
  });

  stack.subscribe("BOOKING_CANCELLED_EVENT", (event) => {
    const booking = bookingsById.get(event.data.bookingId);
    if (!booking) {
      // Unknown booking on replay — skip rather than throw.
      return;
    }
    upsertBooking({
      ...booking,
      status: "cancelled",
      cancelledReason: event.data.reason,
    });
  });

  return {
    getBookings: (): Booking[] => Array.from(bookingsById.values()),
    getBooking: (bookingId: string): Booking | undefined =>
      bookingsById.get(bookingId),

    getUpcomingBookingsForVenue: (
      venueId: string,
      from: Date = new Date(),
    ): Booking[] =>
      Array.from(bookingsById.values())
        .filter(
          (booking) =>
            booking.venueId === venueId &&
            booking.status === "booked" &&
            new Date(booking.startsAt) >= from,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  };
}

export type BookingModelType = ReturnType<typeof BookingModel>;
