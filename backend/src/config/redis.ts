import IORedis, { type Redis } from "ioredis";
import { env } from "./env";

// Single shared Redis connection used by BullMQ, rate limiting, and locks.
// BullMQ creates its own internal connections from this instance.
export const redis: Redis = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 500, 2000),
});

redis.on("connect", () => {
  console.log("[redis] Connected");
});

redis.on("error", (err) => {
  console.error("[redis] Error:", err.message);
});

// A separate Redis connection for rate-limit INCR/EXPIRE and dedupe keys.
// Keeping it separate from BullMQ's internal usage avoids interference.
export const rateLimitRedis: Redis = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 500, 2000),
});

rateLimitRedis.on("error", (err) => {
  console.error("[redis:rateLimit] Error:", err.message);
});
