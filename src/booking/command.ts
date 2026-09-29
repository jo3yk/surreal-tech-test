/** Write side: validate, then record events. State updates via the model. */
import { randomUUID } from "crypto";
import { Request, Response, Router, StackType } from "shimmiestack";
import {
  BookingConfirmedEvent,
  RecordModels,
  SubscribeModels,
} from "../events";
import { BookingModelType } from "./model";
import {
  getErrors,
  metaFrom,
  requireNonEmptyString,
  requireNonNegativeInt,
  requireIsoDate,
  requirePositiveInt,
} from "../helpers";
import { VenueModelType } from "../venue/model";
import { EntertainerModelType } from "../entertainer/model";
import { PaymentModelType } from "../payment/model";

interface CreateBookingRequest {
  venueId: string;
  entertainerId: string;
  feeCents: number;
  startsAt: string;
}

interface RecordPaymentRequest {
  reference: string;
  amountCents: number;
  paidAt: string;
}

export function BookingCommand(
  stack: StackType<RecordModels, SubscribeModels>,
  bookingModel: BookingModelType,
  venueModel: VenueModelType,
  entertainerModel: EntertainerModelType,
  paymentModel: PaymentModelType,
): Router {
  const router = Router();

  router.post(
    "/",
    async (
      req: Request<{}, {}, CreateBookingRequest>,
      res: Response<{ bookingId: string } | { errors: Record<string, string> }>,
    ) => {
      const { venueId, entertainerId, feeCents, startsAt } = req.body;

      const validation = {
        venueId: requireNonEmptyString(venueId, "venueId"),
        entertainerId: requireNonEmptyString(entertainerId, "entertainerId"),
        feeCents: requireNonNegativeInt(feeCents, "feeCents"),
        startsAt: requireIsoDate(startsAt, "startsAt"),
      };

      const errors = getErrors(validation);

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
      }

      const venue = venueModel.getVenue(venueId);

      if (!venue) {
        return res.status(404).json({
          errors: { venueId: `Unknown venue ${venueId}` },
        });
      }
      const entertainer = entertainerModel.getEntertainer(entertainerId);

      if (!entertainer) {
        return res.status(404).json({
          errors: { entertainerId: `Unknown entertainer ${entertainerId}` },
        });
      }

      const bookingId = randomUUID();

      // Unchecked = no optimistic concurrency on stream version.
      await stack.recordUncheckedEvent({
        streamId: `booking-${bookingId}`,
        eventName: "BOOKING_CONFIRMED_EVENT",
        eventData: {
          bookingId,
          venueId,
          entertainerId,
          entertainerName: entertainer.name,
          feeCents,
          startsAt,
        },
        meta: metaFrom(req),
      });

      return res.status(201).json({ bookingId });
    },
  );

  router.post(
    "/:bookingId/payments",
    async (
      req: Request<{ bookingId: string }, {}, RecordPaymentRequest>,
      res: Response<{ paymentId: string } | { errors: Record<string, string> }>,
    ) => {
      const { bookingId } = req.params;
      const { reference, amountCents, paidAt } = req.body;

      const validation = {
        bookingId: requireNonEmptyString(bookingId, "bookingId"),
        reference: requireNonEmptyString(reference, "reference"),
        amountCents: requirePositiveInt(amountCents, "amountCents"),
        paidAt: requireIsoDate(paidAt, "paidAt"),
      };

      const errors = getErrors(validation);

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
      }

      const booking = bookingModel.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({
          errors: {
            bookingId: `Booking with id ${bookingId} not found`,
          },
        });
      }

      // Deliberately no status check: payments against cancelled bookings are
      // recorded so they can be refunded.

      // Idempotency: a retry with the same reference is a no-op (200);
      // reusing the reference for a different payment is a client bug (409).
      // Note: check-then-record isn't atomic, so two concurrent requests with
      // the same reference could both record. Closing that needs a uniqueness
      // constraint in the event base.
      const existing = paymentModel.getPaymentByReference(reference);
      if (existing) {
        if (
          existing.bookingId === bookingId &&
          existing.amountCents === amountCents &&
          Date.parse(existing.paidAt) === Date.parse(paidAt)
        ) {
          return res.status(200).json({ paymentId: existing.paymentId });
        } else {
          return res.status(409).json({
            errors: {
              reference: `Reference ${reference} already used for a different payment`,
            },
          });
        }
      }

      const paymentId = randomUUID();
      const streamId = `payment-${paymentId}`;

      await stack.recordUncheckedEvent({
        streamId,
        eventName: "PAYMENT_RECORDED_EVENT",
        eventData: {
          paymentId,
          reference,
          bookingId,
          amountCents,
          paidAt,
        },
        meta: metaFrom(req),
      });

      return res.status(201).json({ paymentId });
    },
  );

  router.post(
    "/:bookingId/cancel",
    async (
      req: Request<{ bookingId: string }, {}, { reason: string }>,
      res: Response<undefined | { error: string }>,
    ) => {
      const { bookingId } = req.params;
      const reason = req.body?.reason;

      if (!reason) {
        return res.status(400).json({ error: "reason is required" });
      }

      const booking = bookingModel.getBooking(bookingId);
      if (!booking) {
        return res
          .status(404)
          .json({ error: `no booking with id ${bookingId}` });
      }
      if (booking.status === "cancelled") {
        return res.status(409).json({ error: "booking is already cancelled" });
      }

      await stack.recordUncheckedEvent({
        streamId: `booking-${bookingId}`,
        eventName: "BOOKING_CANCELLED_EVENT",
        eventData: { bookingId, reason },
        meta: metaFrom(req),
      });

      return res.sendStatus(200);
    },
  );

  return router;
}
