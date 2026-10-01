/** Load-test diagnostics. Only mounted when DEBUG_ENDPOINTS=true (see index.ts);
 * not for production use. */
import { Request, Response, Router } from "shimmiestack";

const MB = 1024 * 1024;

export interface MemoryReport {
  /** V8 heap in use; where the in-memory read models live. */
  heapUsedMb: number;
  heapTotalMb: number;
  /** Whole-process resident memory. */
  rssMb: number;
  externalMb: number;
}

export function DebugQuery(): Router {
  const router = Router();

  router.get("/memory", (_req: Request, res: Response<MemoryReport>) => {
    const m = process.memoryUsage();
    return res.status(200).json({
      heapUsedMb: m.heapUsed / MB,
      heapTotalMb: m.heapTotal / MB,
      rssMb: m.rss / MB,
      externalMb: m.external / MB,
    });
  });

  return router;
}
