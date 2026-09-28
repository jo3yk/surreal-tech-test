/** Write side: validate, then record events. State updates via the model. */
import { randomUUID } from "crypto";
import { Request, Response, Router, StackType } from "shimmiestack";
import {
  BookingConfirmedEvent,
  RecordModels,
  SubscribeModels,
} from "../events";
import { BookingModelType } from "./model";

/** Event metadata: who, where, when. */
function metaFrom(req: Request) {
  return {
    userAgent: req.get("user-agent") ?? "unknown",
    user: req.get("x-user-id") ?? "anonymous",
    date: Date.now(),
  };
}

export function BookingCommand(
  stack: StackType<RecordModels, SubscribeModels>,
  bookingModel: BookingModelType,
): Router {
  const router = Router();

  router.post(
    "/",
    async (
      req: Request<{}, {}, BookingConfirmedEvent>,
      res: Response<{ bookingId: string } | { error: string }>,
    ) => {
      const { venueId, entertainerId, entertainerName, feeCents, startsAt } =
        req.body;

      if (!venueId || !entertainerId || !entertainerName || !startsAt) {
        return res.status(400).json({
          error:
            "venueId, entertainerId, entertainerName and startsAt are required",
        });
      }
      if (!Number.isInteger(feeCents) || feeCents < 0) {
        return res
          .status(400)
          .json({ error: "feeCents must be a non-negative integer" });
      }
      if (Number.isNaN(Date.parse(startsAt))) {
        return res
          .status(400)
          .json({ error: "startsAt must be an ISO-8601 datetime" });
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
          entertainerName,
          feeCents,
          startsAt,
        },
        meta: metaFrom(req),
      });

      return res.status(201).json({ bookingId });
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
