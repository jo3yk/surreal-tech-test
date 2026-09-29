/** Read side: GET entertainer earnings from the earnings model. */
import { Request, Response, Router } from "shimmiestack";
import { EarningsModelType, EntertainerEarnings } from "./model";

export function EarningsQuery(earningsModel: EarningsModelType): Router {
  const router = Router();

  router.get(
    "/:id/earnings",
    (
      req: Request<{ id: string }>,
      res: Response<EntertainerEarnings | { error: string }>,
    ) => {
      const { id } = req.params;
      const earnings = earningsModel.getEarnings(id);
      if (!earnings) {
        return res.status(404).json({ error: `no entertainer with id ${id}` });
      }
      return res.status(200).json(earnings);
    },
  );

  return router;
}
