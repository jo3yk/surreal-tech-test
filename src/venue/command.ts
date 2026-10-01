/** Write side: create a venue. */
import { randomUUID } from "crypto";
import { Request, Response, Router, StackType } from "shimmiestack";
import { RecordModels, SubscribeModels } from "../events";
import {
  ErrorResponse,
  getErrors,
  metaFrom, requireNonEmptyString, requirePositiveInt,
  validationError,
} from "../helpers";

interface CreateVenueRequest {
  name: string;
  capacity: number;
}

export function VenueCommand(
  stack: StackType<RecordModels, SubscribeModels>,
): Router {
  const router = Router();

  router.post(
    "/",
    async (
      req: Request<{}, {}, CreateVenueRequest>,
      res: Response<{ venueId: string } | ErrorResponse>,
    ) => {
      const { name, capacity } = req.body;

      const validation = {
        name: requireNonEmptyString(name, "name"),
        capacity: requirePositiveInt(capacity, "capacity")
      }

      const errors = getErrors(validation);

      if (Object.keys(errors).length > 0) {
        return res.status(400).json(validationError(errors));
      }

      const venueId = randomUUID();

      await stack.recordUncheckedEvent({
        streamId: `venue-${venueId}`,
        eventName: "VENUE_CREATED_EVENT",
        eventData: {venueId, name, capacity},
        meta: metaFrom(req)
      })
      
      return res.status(201).json({venueId})
    },
  );

  return router;
}
