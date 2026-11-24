import { Worker, type Job } from "bullmq";
import nodemailer from "nodemailer";
import { redis } from "../config/redis";
import { prisma } from "../db/prisma";
import { EMAIL_QUEUE_NAME, type EmailJobData } from "./emailQueue";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import {
  consumeRateLimit,
  acquireMinDelayLock,
  timeUntilMinDelaySatisfied,
  shouldNotifySlack,
} from "../services/rateLimitService";
import { sendRateLimitAlert } from "../services/slackService";
import { indexEmail } from "../services/elasticService";
import { createTransporter, findSender } from "../utils/ethereal";

/**
 * BullMQ worker that processes scheduled email jobs.
 *
 * Pipeline per job:
 * 1. Atomic idempotency check: UPDATE emails SET status='PROCESSING'
 *    WHERE id=? AND status='SCHEDULED' RETURNING *. If 0 rows, skip.
 * 2. Per-sender hourly rate-limit check (Redis INCR). If exceeded, reschedule
 *    into the next hour window and send a deduped Slack alert.
 * 3. Per-sender minimum-delay lock (Redis Lua). If not satisfied, reschedule
 *    the job with a short delay.
 * 4. Send the email via Nodemailer (Ethereal SMTP).
 * 5. Update PostgreSQL to SENT with the Ethereal preview URL.
 * 6. Sync to Elasticsearch.
 *
 * On failure (after all retries), mark as FAILED.
 */

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailId, senderEmail, subject, body, recipientEmail, userId } = job.data;

  logger.info(`[worker] Processing job ${job.id} for ${recipientEmail}`);

  // ── Step 1: Atomic idempotency check ──────────────────────────────────
  // Only proceed if the row is in SCHEDULED state. This prevents duplicate
  // sends even if BullMQ redelivers the job (e.g., after a crash).
  const updated = await prisma.$queryRaw<
    Array<{ id: string }>
  >`UPDATE emails SET status = 'PROCESSING', "updatedAt" = NOW() WHERE id = ${emailId} AND status = 'SCHEDULED' RETURNING id`;

  if (updated.length === 0) {
    // Either already sent, already processing, or doesn't exist. Skip safely.
    logger.info(`[worker] Job ${job.id} skipped — email ${emailId} not in SCHEDULED state`);
    return;
  }

  const effectiveHourlyLimit = job.data.hourlyLimit || env.maxEmailsPerHourPerSender;
  const minDelayMs = job.data.minDelayMs || env.minDelayBetweenEmailsMs;

  // ── Step 2: Per-sender hourly rate limit ──────────────────────────────
  const rateResult = await consumeRateLimit(senderEmail, effectiveHourlyLimit);
  if (!rateResult.allowed && rateResult.rescheduleAt) {
    const rescheduleDate = new Date(rateResult.rescheduleAt);

    // Update DB to reflect the reschedule.
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: "RATE_LIMITED_RESCHEDULED",
        scheduledAt: rescheduleDate,
      },
    });

    // Re-index in Elasticsearch.
    const freshEmail = await prisma.email.findUnique({ where: { id: emailId } });
    if (freshEmail) void indexEmail(freshEmail);

    // Move the BullMQ job to the next window. BullMQ uses the job's internal
    // lock token when no explicit token is passed.
    await job.moveToDelayed(rateResult.rescheduleAt);
    logger.warn(
      `[worker] Job ${job.id} rate-limited, rescheduled to ${rescheduleDate.toISOString()}`,
    );

    // ── Step 2b: Deduped Slack alert ───────────────────────────────────
    // Only send ONE Slack notification per sender per hour window (SETNX dedupe).
    const shouldNotify = await shouldNotifySlack(senderEmail);
    if (shouldNotify) {
      void sendRateLimitAlert(userId, {
        senderEmail,
        rescheduledCount: rateResult.currentCount,
        nextWindowOpensAt: new Date(rateResult.rescheduleAt),
      });
    }

    return; // Job is now delayed — it will retry at the next window.
  }

  // ── Step 3: Per-sender minimum delay lock ────────────────────────────
  const canSend = await acquireMinDelayLock(senderEmail, minDelayMs);
  if (!canSend) {
    // Not enough time since the last send by this sender. Reschedule with a short delay.
    const waitMs = await timeUntilMinDelaySatisfied(senderEmail, minDelayMs);
    const rescheduleDate = new Date(Date.now() + waitMs);

    // Roll the row back to SCHEDULED so the idempotency check passes on retry.
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "SCHEDULED", scheduledAt: rescheduleDate },
    });

    await job.moveToDelayed(rescheduleDate.getTime());
    logger.info(
      `[worker] Job ${job.id} waiting ${waitMs}ms for min-delay for sender ${senderEmail}`,
    );
    return;
  }

  // ── Step 4: Send the email via Nodemailer (Ethereal) ──────────────────
  const senderConfig = findSender(senderEmail);
  if (!senderConfig) {
    throw new Error(`No SMTP configuration found for sender ${senderEmail}`);
  }

  const transporter = createTransporter(senderConfig);

  try {
    const info = await transporter.sendMail({
      from: `"Outbox Scheduler" <${senderEmail}>`,
      to: recipientEmail,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>\n"),
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) as string | null;

    // ── Step 5: Mark as SENT ───────────────────────────────────────────
    const sentEmail = await prisma.email.update({
      where: { id: emailId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        etherealPreviewUrl: previewUrl || null,
      },
    });

    // ── Step 6: Sync to Elasticsearch ──────────────────────────────────
    void indexEmail(sentEmail);

    logger.info(
      `[worker] Email ${emailId} sent to ${recipientEmail} (preview: ${previewUrl || "n/a"})`,
    );
  } catch (sendErr) {
    // Sending failed — roll back to SCHEDULED so the retry's idempotency
    // check (WHERE status = 'SCHEDULED') can pass on the next attempt.
    // The final FAILED status is set in the worker's "failed" event handler
    // after all BullMQ retries are exhausted.
    const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
    logger.error(`[worker] Send failed for ${emailId}: ${message}`);

    await prisma.email.update({
      where: { id: emailId },
      data: { status: "SCHEDULED" },
    });

    // Re-throw so BullMQ counts this as a failed attempt (and retries per backoff).
    throw sendErr;
  }
}

/**
 * Create and start the BullMQ worker.
 * Concurrency is configurable via WORKER_CONCURRENCY env.
 */
export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job) => {
      await processEmailJob(job);
    },
    {
      connection: redis,
      concurrency: env.workerConcurrency,
      // Lock duration: BullMQ's stalled-job protection. Renewed automatically.
      lockDuration: 60_000,
      maxStalledCount: 1,
    },
  );

  worker.on("completed", (job) => {
    logger.debug(`[worker] Job ${job.id} completed`);
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;

    const maxAttempts = job.opts?.attempts || 1;

    if (job.attemptsMade >= maxAttempts) {
      // All retries exhausted — mark the email as FAILED in PostgreSQL.
      const emailId = (job.data as EmailJobData).emailId;
      logger.error(`[worker] Job ${job.id} permanently failed after ${job.attemptsMade} attempts: ${err.message}`);

      try {
        const failedEmail = await prisma.email.update({
          where: { id: emailId },
          data: {
            status: "FAILED",
            failReason: err.message,
          },
        });
        void indexEmail(failedEmail);
      } catch (dbErr) {
        logger.error(`[worker] Failed to mark email ${emailId} as FAILED: ${(dbErr as Error).message}`);
      }
    } else {
      logger.warn(`[worker] Job ${job.id} attempt ${job.attemptsMade}/${maxAttempts} failed: ${err.message} — will retry`);
    }
  });

  worker.on("error", (err) => {
    logger.error(`[worker] Worker error: ${err.message}`);
  });

  logger.info(`[worker] Email worker started (concurrency=${env.workerConcurrency})`);
  return worker;
}
