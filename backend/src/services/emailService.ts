import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";
import { scheduleEmailJob, type EmailJobData } from "../queues/emailQueue";
import { indexEmail } from "./elasticService";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Core email scheduling service.
 *
 * Scheduling flow:
 * 1. Validate the input (sender exists, recipients are valid emails).
 * 2. For each recipient, persist a row in PostgreSQL with status=SCHEDULED
 *    and a unique idempotency_key.
 * 3. Enqueue a BullMQ delayed job with jobId = email.id.
 * 4. Index the email into Elasticsearch.
 */

export interface ScheduleEmailInput {
  userId: string;
  senderEmail: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string; // ISO string
  hourlyLimit: number;
  minDelaySeconds: number;
  idempotencyKey?: string;
}

export interface ScheduleResult {
  created: number;
  emails: { id: string; recipientEmail: string; status: string }[];
  skippedDuplicates: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function extractEmailsFromText(text: string): string[] {
  // Extracts all valid email addresses from raw text / CSV content.
  const matches = text.match(/[^\s;,]+@[^\s;,]+\.[^\s;,]+/g) || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const cleaned = m.trim().replace(/^[<\[]+|[>\].]+$/g, "");
    if (validateEmail(cleaned) && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      result.push(cleaned);
    }
  }
  return result;
}

/**
 * Schedule one or more emails.
 * Uses an idempotency key (per batch) so a retried request doesn't create duplicates.
 */
export async function scheduleEmails(input: ScheduleEmailInput): Promise<ScheduleResult> {
  const {
    userId,
    senderEmail,
    recipients,
    subject,
    body,
    scheduledAt,
    hourlyLimit,
    minDelaySeconds,
    idempotencyKey,
  } = input;

  const scheduledDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error("Invalid scheduledAt date");
  }

  const minDelayMs = minDelaySeconds * 1000 || env.minDelayBetweenEmailsMs;
  const effectiveHourlyLimit = hourlyLimit || env.maxEmailsPerHourPerSender;

  const emails: { id: string; recipientEmail: string; status: string }[] = [];
  let skippedDuplicates = 0;

  // Distribute recipients across the start time with the configured delay.
  // Each recipient gets scheduledAt = baseStart + (index * minDelayMs).
  for (let i = 0; i < recipients.length; i++) {
    const recipientEmail = recipients[i].trim().toLowerCase();

    // Idempotency key is unique per (batchKey + recipient) so re-submits of the
    // same batch skip already-created emails.
    const baseKey = idempotencyKey || randomUUID();
    const idempotencyKeyForThis = `${baseKey}:${recipientEmail}:${senderEmail}`;

    // Check if an email with this idempotency key already exists.
    const existing = await prisma.email.findUnique({
      where: { idempotencyKey: idempotencyKeyForThis },
      select: { id: true, status: true },
    });

    if (existing) {
      skippedDuplicates++;
      continue;
    }

    // Compute per-recipient scheduled time with staggered delay.
    const recipientScheduledAt = new Date(scheduledDate.getTime() + i * minDelayMs);
    const emailId = randomUUID();

    const email = await prisma.email.create({
      data: {
        id: emailId,
        idempotencyKey: idempotencyKeyForThis,
        userId,
        senderEmail,
        recipientEmail,
        subject,
        body,
        status: "SCHEDULED",
        scheduledAt: recipientScheduledAt,
        hourlyLimit: effectiveHourlyLimit,
        minDelaySeconds,
      },
    });

    // Enqueue the BullMQ delayed job.
    const jobData: EmailJobData = {
      emailId,
      userId,
      senderEmail,
      recipientEmail,
      subject,
      body,
      hourlyLimit: effectiveHourlyLimit,
      minDelayMs,
    };

    await scheduleEmailJob(jobData, recipientScheduledAt);

    // Index into Elasticsearch (async, non-blocking for the response).
    void indexEmail(email);

    emails.push({ id: emailId, recipientEmail, status: email.status });
  }

  logger.info(`[emailService] Scheduled ${emails.length} email(s) for sender ${senderEmail}`);

  return {
    created: emails.length,
    emails,
    skippedDuplicates,
  };
}

/**
 * Get paginated emails for a user filtered by status.
 */
export async function getEmailsByStatus(
  userId: string,
  status: string,
  page: number = 1,
  limit: number = 50,
) {
  const where: { userId: string; status?: { in: string[] } } = { userId };
  if (status !== "ALL") {
    // Support comma-separated statuses, e.g. "SCHEDULED,RATE_LIMITED_RESCHEDULED"
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      where.status = { in: statuses };
    } else if (statuses.length > 1) {
      where.status = { in: statuses };
    }
  }

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.email.count({ where }),
  ]);

  return { emails, total, page, limit };
}

/**
 * Count emails by status for a user (for badges).
 */
export async function getEmailCounts(userId: string) {
  const [scheduled, sent, failed, rateLimited] = await Promise.all([
    prisma.email.count({ where: { userId, status: "SCHEDULED" } }),
    prisma.email.count({ where: { userId, status: "SENT" } }),
    prisma.email.count({ where: { userId, status: "FAILED" } }),
    prisma.email.count({ where: { userId, status: "RATE_LIMITED_RESCHEDULED" } }),
  ]);

  return {
    scheduled: scheduled + rateLimited, // rate-limited ones are still pending
    sent,
    failed,
    rateLimited,
  };
}
