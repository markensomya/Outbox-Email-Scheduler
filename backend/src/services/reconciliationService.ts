import { prisma } from "../db/prisma";
import { emailQueue, scheduleEmailJob, type EmailJobData } from "../queues/emailQueue";
import { logger } from "../utils/logger";

/**
 * Startup reconciliation service.
 *
 * On server/worker startup, this checks for:
 * 1. Emails stuck in PROCESSING (server crashed mid-send) — reset to SCHEDULED
 *    and re-enqueue, unless they were already sent (we trust the idempotency
 *    check in the worker to catch duplicates).
 * 2. Emails in SCHEDULED or RATE_LIMITED_RESCHEDULED state whose BullMQ job
 *    may be missing from Redis (e.g., Redis data loss despite AOF) — re-enqueue.
 *
 * This guarantees restart survival: no lost future jobs, no duplicate sends.
 */
export async function reconcileOnStartup(): Promise<void> {
  logger.info("[reconcile] Running startup reconciliation...");

  // ── 1. Recover stuck PROCESSING emails ────────────────────────────────
  const stuckProcessing = await prisma.email.findMany({
    where: { status: "PROCESSING" },
  });

  if (stuckProcessing.length > 0) {
    logger.warn(
      `[reconcile] Found ${stuckProcessing.length} email(s) stuck in PROCESSING. Resetting to SCHEDULED.`,
    );

    for (const email of stuckProcessing) {
      // Reset to SCHEDULED so the worker's idempotency check will let it through.
      // If the email was actually sent before the crash, the worker's atomic
      // UPDATE will find status != SCHEDULED and skip — no duplicate send.
      await prisma.email.update({
        where: { id: email.id },
        data: { status: "SCHEDULED" },
      });

      // Re-enqueue if the scheduled time is in the future; otherwise send soon.
      const delay = email.scheduledAt.getTime() - Date.now();
      const jobData: EmailJobData = {
        emailId: email.id,
        userId: email.userId,
        senderEmail: email.senderEmail,
        recipientEmail: email.recipientEmail,
        subject: email.subject,
        body: email.body,
        hourlyLimit: email.hourlyLimit,
        minDelayMs: email.minDelaySeconds * 1000,
      };

      // Check if the job still exists in Redis.
      const existingJob = await emailQueue.getJob(email.id);
      if (!existingJob) {
        // Job is missing from Redis — re-enqueue with the original jobId.
        await scheduleEmailJob(jobData, email.scheduledAt);
        logger.info(`[reconcile] Re-enqueued stuck PROCESSING email ${email.id}`);
      } else {
        logger.info(`[reconcile] Stuck email ${email.id} still has a Redis job, keeping it`);
      }
    }
  }

  // ── 2. Recover SCHEDULED / RATE_LIMITED emails missing from Redis ──────
  const pendingStatuses = ["SCHEDULED", "RATE_LIMITED_RESCHEDULED"];
  const pendingEmails = await prisma.email.findMany({
    where: { status: { in: pendingStatuses } },
  });

  if (pendingEmails.length > 0) {
    logger.info(
      `[reconcile] Checking ${pendingEmails.length} pending email(s) for Redis job presence...`,
    );

    let reEnqueued = 0;
    for (const email of pendingEmails) {
      const existingJob = await emailQueue.getJob(email.id);
      if (!existingJob) {
        // Job missing from Redis — re-enqueue with original jobId.
        const jobData: EmailJobData = {
          emailId: email.id,
          userId: email.userId,
          senderEmail: email.senderEmail,
          recipientEmail: email.recipientEmail,
          subject: email.subject,
          body: email.body,
          hourlyLimit: email.hourlyLimit,
          minDelayMs: email.minDelaySeconds * 1000,
        };

        // For past-due scheduled times, enqueue for immediate processing.
        const scheduledAt = new Date(Math.max(email.scheduledAt.getTime(), Date.now() + 1000));
        await scheduleEmailJob(jobData, scheduledAt);
        reEnqueued++;
      }
    }

    if (reEnqueued > 0) {
      logger.info(`[reconcile] Re-enqueued ${reEnqueued} missing job(s) back into Redis`);
    } else {
      logger.info("[reconcile] All pending emails have active Redis jobs");
    }

    // ── 3. Normalize RATE_LIMITED_RESCHEDULED back to SCHEDULED ──────────
    // If the scheduled time has passed (we're past the rate-limit window),
    // reset to SCHEDULED so the worker processes them normally.
    const pastRateLimited = pendingEmails.filter(
      (e) => e.status === "RATE_LIMITED_RESCHEDULED" && e.scheduledAt.getTime() <= Date.now(),
    );
    for (const email of pastRateLimited) {
      await prisma.email.update({
        where: { id: email.id },
        data: { status: "SCHEDULED" },
      });
    }
  }

  logger.info("[reconcile] Reconciliation complete");
}
