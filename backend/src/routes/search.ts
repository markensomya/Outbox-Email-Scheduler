import { Router, Request, Response } from "express";
import { searchEmails } from "../services/elasticService";
import { authMiddleware, getAuthUser } from "../auth/middleware";

const router = Router();

/**
 * GET /api/emails/search?q=<query>&status=<SCHEDULED|SENT|FAILED|ALL>
 * Full-text search across recipientEmail, subject, and body via Elasticsearch.
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || "";
    const status = (req.query.status as string) || "ALL";

    const results = await searchEmails({
      query,
      status,
      userId: getAuthUser(req).id,
    });

    res.json({ results, total: results.length });
  } catch (err) {
    // If Elasticsearch is down, return an empty result set rather than 500
    // so the frontend search bar degrades gracefully.
    res.json({ results: [], total: 0, error: (err as Error).message });
  }
});

export default router;
