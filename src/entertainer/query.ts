/** Read side: GET entertainer info from in-memory model */
import { Request, Response, Router } from "shimmiestack";
import { ErrorResponse } from "../helpers";
import { Entertainer, EntertainerModelType } from "./model";

export function EntertainerQuery(
  entertainerModel: EntertainerModelType,
): Router {
  const router = Router();

  router.get(
    "/:id",
    (
      req: Request<{ id: string }>,
      res: Response<Entertainer | ErrorResponse>,
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

  return router;
}
