import { Request, Response, Router } from "shimmiestack";
import { ErrorResponse } from "../helpers";
import { Booking, BookingModelType } from "../booking/model";
import { Venue, VenueModelType } from "./model";

export function VenueQuery(
  bookingModel: BookingModelType,
  venueModel: VenueModelType,
): Router {
  const router = Router();

  router.get(
    "/:id",
    (
      req: Request<{ id: string }>,
      res: Response<Venue | ErrorResponse>,
    ) => {
      const { id } = req.params;
      const venue = venueModel.getVenue(id);
      if (!venue) {
        return res.status(404).json({ error: `Venue id ${id} not found` });
      }
      return res.status(200).json(venue);
    },
  );

  router.get(
    "/:id/bookings",
    (
      req: Request<{ id: string }, never, never, { from?: string }>,
      res: Response<{ bookings: Booking[] }>,
    ) => {
      const from = req.query.from
        ? new Date(String(req.query.from))
        : undefined; // model defaults to now
      return res.status(200).json({
        bookings: bookingModel.getUpcomingBookingsForVenue(req.params.id, from),
      });
    },
  );

  return router;
}
