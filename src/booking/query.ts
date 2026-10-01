/** Read side: GETs from the in-memory model. */
import { Request, Response, Router } from "shimmiestack";
import { ErrorResponse } from "../helpers";
import { Booking, BookingModelType } from "./model";

export function BookingQuery(bookingModel: BookingModelType): Router {
  const router = Router();

  router.get(
    "/:id",
    (
      req: Request<{ id: string }>,
      res: Response<{ booking: Booking } | ErrorResponse>,
    ) => {
      const booking = bookingModel.getBooking(req.params.id);
      if (!booking) {
        return res
          .status(404)
          .json({ error: `no booking with id ${req.params.id}` });
      }
      return res.status(200).json({ booking });
    },
  );

  return router;
}
