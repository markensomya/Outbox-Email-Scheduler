import { Router, Request, Response } from "express";
import {
  scheduleEmails,
  validateEmail,
  getEmailsByStatus,
  getEmailCounts,
} from "../services/emailService";
import { authMiddleware, getAuthUser } from "../auth/middleware";
import { env } from "../config/env";

const router = Router();

// All email routes require authentication.
router.use(authMiddleware);

/**
 * GET /api/emails/senders
 * Returns the list of configured sender accounts for the compose selector.
 * Uses Resend's from address (HTTP API, not SMTP).
 */
router.get("/senders", (_req: Request, res: Response) => {
  const fromEmail = env.resendFromEmail || "onboarding@resend.dev";
  res.json({
    senders: [
      {
        email: fromEmail,
        smtpUser: fromEmail,
      },
    ],
  });
});

/**
 * POST /api/emails/schedule
 * Schedule one or more emails.
 *
 * Body:
 *   senderEmail: string
 *   recipients: string[]          — array of recipient email addresses
 *   subject: string
 *   body: string
 *   scheduledAt: string           — ISO 8601 datetime
 *   hourlyLimit: number            — per-sender hourly limit override
 *   minDelaySeconds: number        — delay between emails in seconds
 *   idempotencyKey?: string        — optional batch idempotency key
 */
router.post("/schedule", async (req: Request, res: Response) => {
  try {
    const {
      senderEmail,
      recipients,
      subject,
      body,
      scheduledAt,
      hourlyLimit,
      minDelaySeconds,
      idempotencyKey,
    } = req.body;

    // ── Validation ──
    if (!senderEmail || !subject || !body || !scheduledAt) {
      res.status(400).json({ error: "Missing required fields: senderEmail, subject, body, scheduledAt" });
      return;
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: "recipients must be a non-empty array" });
      return;
    }

    const invalidRecipients = recipients.filter((r: string) => !validateEmail(r));
    if (invalidRecipients.length > 0) {
      res.status(400).json({
        error: "Invalid email addresses",
        invalid: invalidRecipients,
      });
      return;
    }

    const result = await scheduleEmails({
      userId: getAuthUser(req).id,
      senderEmail,
      recipients,
      subject,
      body,
      scheduledAt,
      hourlyLimit: Number(hourlyLimit) || 0,
      minDelaySeconds: Number(minDelaySeconds) || 2,
      idempotencyKey,
    });

    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/emails?status=SCHEDULED|SENT|FAILED&page=1&limit=50
 * Returns paginated emails for the authenticated user filtered by status.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || "ALL";
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;

    const result = await getEmailsByStatus(getAuthUser(req).id, status, page, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/emails/counts
 * Returns badge counts for the sidebar tabs.
 */
router.get("/counts", async (req: Request, res: Response) => {
  try {
    const counts = await getEmailCounts(getAuthUser(req).id);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
