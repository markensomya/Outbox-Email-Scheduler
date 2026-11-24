import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import { ensureElasticsearchIndex } from "./config/elastic";
import { startEmailWorker } from "./queues/worker";
import { reconcileOnStartup } from "./services/reconciliationService";
import { logger } from "./utils/logger";

/**
 * Main server entry point.
 *
 * Boots the Express API server, starts the BullMQ worker in the same process
 * (for simplicity in local dev), ensures the Elasticsearch index exists, and
 * runs startup reconciliation to recover any jobs lost during a crash.
 *
 * In production, the API server and worker can be run as separate processes
 * (see worker-entry.ts).
 */
async function main(): Promise<void> {
  logger.info("[server] Starting Outbox Email Scheduler...");

  if (env.resendApiKey) {
    logger.info(`[server] Resend email API configured (from: ${env.resendFromEmail})`);
  } else {
    logger.warn("[server] RESEND_API_KEY not set — emails will fail to send. Get a free key at https://resend.com");
  }

  // Ensure Elasticsearch index exists (non-blocking on failure).
  await ensureElasticsearchIndex();

  // Startup reconciliation: recover stuck PROCESSING rows and missing Redis jobs.
  await reconcileOnStartup();

  // Start the BullMQ worker in-process for local dev.
  startEmailWorker();

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info(`[server] API server running on port ${env.port}`);
    logger.info(`[server] Bull Board dashboard at http://localhost:${env.port}/admin/queues`);
  });

  // Graceful shutdown.
  const shutdown = async (signal: string) => {
    logger.info(`[server] Received ${signal}, shutting down gracefully...`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("[server] Fatal error on startup:", { error: err.message });
  process.exit(1);
});
