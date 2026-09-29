/** Write side: create an entertainer. */
import { randomUUID } from "crypto";
import { Request, Response, Router, StackType } from "shimmiestack";
import { RecordModels, SubscribeModels } from "../events";
import { getErrors, metaFrom, requireNonEmptyString } from "../helpers";

interface CreateEntertainerRequest {
  name: string;
  genre: string;
}

export function EntertainerCommand(
  stack: StackType<RecordModels, SubscribeModels>,
): Router {
  const router = Router();

  router.post(
    "/",
    async (
      req: Request<{}, {}, CreateEntertainerRequest>,
      res: Response<
        { entertainerId: string } | { errors: Record<string, string> }
      >,
    ) => {
      const { name, genre } = req.body;

      const validation = {
        name: requireNonEmptyString(name, "name"),
        genre: requireNonEmptyString(genre, "genre"),
      };

      const errors = getErrors(validation);

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
      }

      const entertainerId = randomUUID();

      await stack.recordUncheckedEvent({
        streamId: `entertainer-${entertainerId}`,
        eventName: "ENTERTAINER_CREATED_EVENT",
        eventData: { entertainerId, name, genre },
        meta: metaFrom(req),
      });

      return res.status(201).json({ entertainerId });
    },
  );

  return router;
}
