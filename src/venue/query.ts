import { Request, Response, Router } from "shimmiestack";
import { Booking, BookingModelType } from "../booking/model";

export function VenueQuery(bookingModel: BookingModelType): Router {
  const router = Router();

  router.get(
    "/:id/bookings",
    (
      req: Request<{ id: string }, never, never, { from?: string }>,
      res: Response<{ bookings: Booking[] }>,
    ) => {
      const from = req.query.from
        ? new Date(String(req.query.from))
        : new Date(0);
      return res.status(200).json({
        bookings: bookingModel.getUpcomingBookingsForVenue(req.params.id, from),
      });
    },
  );

  return router;
}
