import { Queue } from "bullmq";
import { redis } from "../config/redis";
import { logger } from "../utils/logger";

/**
 * BullMQ queue for email scheduling.
 *
 * We use BullMQ's delayed-job feature: when scheduling, we add a job with
 * { delay: targetTimestamp - Date.now(), jobId: email.id }.
 * The jobId is set to the email's UUID so we have a 1:1 mapping between
 * the PostgreSQL row and the BullMQ job — critical for idempotency and
 * restart reconciliation.
 */

export const EMAIL_QUEUE_NAME = "email-queue";

export interface EmailJobData {
  emailId: string;
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  hourlyLimit: number;
  minDelayMs: number;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

/**
 * Enqueue a single email as a delayed BullMQ job.
 * The delay is computed from the scheduledAt timestamp.
 */
export async function scheduleEmailJob(
  data: EmailJobData,
  scheduledAt: Date,
): Promise<void> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());

  await emailQueue.add("send-email", data, {
    delay,
    jobId: data.emailId, // 1:1 mapping with PostgreSQL row
  });
}

/**
 * Move a delayed job into a new time window (used when rate-limited).
 * Uses job.moveToDelayed so the job stays in the same queue.
 */
export async function rescheduleEmailJob(
  emailId: string,
  nextTimestamp: number,
): Promise<void> {
  const job = await emailQueue.getJob(emailId);
  if (job) {
    await job.moveToDelayed(nextTimestamp);
    return;
  }

  logger.debug(`[queue] Job ${emailId} not found in Redis, re-adding`);
}
