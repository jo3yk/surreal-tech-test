/** Read side: GET entertainer info from in-memory model */
import { Request, Response, Router } from "shimmiestack";
import {
  Entertainer,
  EntertainerEarnings,
  EntertainerModelType,
} from "./model";
import { Booking, BookingEarnings, BookingModelType } from "../booking/model";
import { Payment, PaymentModelType } from "../payment/model";

/** Payments against cancelled bookings: we record and count them (there's no
 * status check on the payment endpoint — see booking/command.ts). A payment
 * is a fact about money that already moved (e.g. a deposit paid before the
 * gig was cancelled); refusing to record it would make the ledger disagree
 * with the bank. So a cancelled booking keeps its paidCents, still counts
 * towards totalPaidCents, and has outstandingCents = 0 because the fee is no
 * longer owed. Returning the money is a separate event for future implementation.
 */
function toBookingEarnings(
  booking: Booking,
  payments: Payment[],
): BookingEarnings {
  const paidCents = payments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  );
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
    payments,
  };
}

export function EntertainerQuery(
  entertainerModel: EntertainerModelType,
  bookingModel: BookingModelType,
  paymentModel: PaymentModelType,
): Router {
  const router = Router();

  router.get(
    "/:id",
    (
      req: Request<{ id: string }>,
      res: Response<Entertainer | { error: string }>,
    ) => {
      const { id } = req.params;
      const entertainer = entertainerModel.getEntertainer(id);
      if (!entertainer) {
        return res
          .status(404)
          .json({ error: `Entertainer id ${id} not found` });
      }
      return res.status(200).json(entertainer);
    },
  );

  router.get(
    "/:id/earnings",
    (
      req: Request<{ id: string }>,
      res: Response<EntertainerEarnings | { error: string }>,
    ) => {
      const { id } = req.params;
      const entertainer = entertainerModel.getEntertainer(id);
      if (!entertainer) {
        return res.status(404).json({ error: `no entertainer with id ${id}` });
      }

      const bookings = bookingModel
        .getBookings()
        .filter((booking) => booking.entertainerId === id)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

      const breakdown = bookings.map((b) =>
        toBookingEarnings(b, paymentModel.getPaymentsForBooking(b.bookingId)),
      );

      const earnings: EntertainerEarnings = {
        entertainerId: id,
        entertainerName: entertainer.name,
        totalPaidCents: breakdown.reduce((sum, b) => sum + b.paidCents, 0),
        totalOutstandingCents: breakdown.reduce(
          (sum, b) => sum + b.outstandingCents,
          0,
        ),
        bookings: breakdown,
      };

      return res.status(200).json(earnings);
    },
  );

  return router;
}
