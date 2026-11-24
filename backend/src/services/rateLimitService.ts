import { rateLimitRedis } from "../config/redis";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Distributed, atomic per-sender hourly rate limiter.
 *
 * Uses Redis INCR + EXPIRE keyed by rate_limit:<senderEmail>:<YYYY-MM-DD-HH>.
 * If the count exceeds MAX_EMAILS_PER_HOUR_PER_SENDER, the job is rescheduled
 * into the next hour window (with a staggered jitter to avoid thundering herd).
 */

const RATE_LIMIT_PREFIX = "rate_limit:";
const SLACK_NOTIFIED_PREFIX = "slack_notified:";

/** Returns the hour window key suffix, e.g. "2026-11-24-14". */
export function getHourWindowKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}-${h}`;
}

/** Returns the UTC timestamp at the start of the *next* hour window. */
export function getNextHourStartTimestamp(date: Date = new Date()): number {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime();
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  rescheduleAt: number | null;
}

/**
 * Atomically attempt to consume a rate-limit slot for this sender in the current hour.
 * If the limit is reached, returns `allowed: false` with the timestamp to reschedule to.
 */
export async function consumeRateLimit(
  senderEmail: string,
  limit: number = env.maxEmailsPerHourPerSender,
): Promise<RateLimitResult> {
  const hourKey = getHourWindowKey();
  const key = `${RATE_LIMIT_PREFIX}${senderEmail}:${hourKey}`;

  // INCR is atomic in Redis. The first INCR sets the value to 1.
  const count = await rateLimitRedis.incr(key);

  // Set TTL so the key expires at the end of the hour window (3601s buffer).
  if (count === 1) {
    await rateLimitRedis.expire(key, 3601);
  }

  if (count <= limit) {
    return { allowed: true, currentCount: count, limit, rescheduleAt: null };
  }

  // We exceeded the limit — decrement since we won't actually send.
  await rateLimitRedis.decr(key);

  // Calculate next window start with staggered jitter (0–60s spread).
  const nextWindowStart = getNextHourStartTimestamp();
  // Jitter: spread reschedules across up to 60 seconds to avoid thundering herd.
  const jitter = Math.floor(Math.random() * 60_000);
  const rescheduleAt = nextWindowStart + jitter;

  logger.warn(
    `[rateLimit] Sender ${senderEmail} hit hourly limit (${limit}). Rescheduling to ${new Date(rescheduleAt).toISOString()}`,
  );

  return { allowed: false, currentCount: count - 1, limit, rescheduleAt };
}

/**
 * Dedupe Slack notification: returns true if we should send the notification
 * (first caller in this hour window for this sender).
 * Uses SETNX with an hour TTL.
 */
export async function shouldNotifySlack(senderEmail: string): Promise<boolean> {
  const hourKey = getHourWindowKey();
  const key = `${SLACK_NOTIFIED_PREFIX}${senderEmail}:${hourKey}`;
  // SETNX returns 1 if the key was set (first caller), 0 if it already existed.
  const result = await rateLimitRedis.setnx(key, "1");
  if (result === 1) {
    await rateLimitRedis.expire(key, 3601);
    return true;
  }
  return false;
}

/**
 * Per-sender minimum delay lock using a Redis timestamp.
 * Returns true if enough time has passed since the last send by this sender,
 * or false with the timestamp when it will be OK to send.
 *
 * Uses a Lua script for atomic check-and-set so concurrent workers never violate the gap.
 */
const MIN_DELAY_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local minDelay = tonumber(ARGV[2])
local lastSent = redis.call('GET', key)
if lastSent == false then
  redis.call('SET', key, now)
  return 1
end
local last = tonumber(lastSent)
if (now - last) >= minDelay then
  redis.call('SET', key, now)
  return 1
end
return 0
`;

// Load the script once and cache its SHA.
let delayScriptSha: string | null = null;

async function getDelayScriptSha(): Promise<string> {
  if (delayScriptSha) return delayScriptSha;
  const sha = (await rateLimitRedis.script("LOAD", MIN_DELAY_SCRIPT)) as string;
  delayScriptSha = sha;
  return sha;
}

const SENDER_LAST_SENT_PREFIX = "sender:last_sent:";

/**
 * Try to acquire the minimum-delay lock for a sender.
 * Returns true if the sender is allowed to send now (and the lock is acquired).
 * Returns false if the sender must wait (caller should reschedule the job with a short delay).
 */
export async function acquireMinDelayLock(senderEmail: string, minDelayMs: number): Promise<boolean> {
  const key = `${SENDER_LAST_SENT_PREFIX}${senderEmail}`;
  const now = Date.now();

  // Use EVALSHA (fall back to EVAL if script was flushed).
  try {
    const sha = await getDelayScriptSha();
    const result = await rateLimitRedis.evalsha(sha, 1, key, now, minDelayMs);
    return result === 1;
  } catch {
    // If the script was flushed (NOSCRIPT), reload and retry.
    delayScriptSha = null;
    const sha = (await rateLimitRedis.script("LOAD", MIN_DELAY_SCRIPT)) as string;
    delayScriptSha = sha;
    const result = await rateLimitRedis.evalsha(sha, 1, key, now, minDelayMs);
    return result === 1;
  }
}

/**
 * Calculate the delay until the minimum-gap constraint is satisfied.
 * Used when we need to reschedule a job that couldn't acquire the min-delay lock.
 */
export async function timeUntilMinDelaySatisfied(senderEmail: string, minDelayMs: number): Promise<number> {
  const key = `${SENDER_LAST_SENT_PREFIX}${senderEmail}`;
  const lastSentStr = await rateLimitRedis.get(key);
  if (!lastSentStr) return 0;
  const lastSent = parseInt(lastSentStr, 10);
  const elapsed = Date.now() - lastSent;
  const remaining = minDelayMs - elapsed;
  return remaining > 0 ? remaining + 50 : 0; // 50ms buffer
}
