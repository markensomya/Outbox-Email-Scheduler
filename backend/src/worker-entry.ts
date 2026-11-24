import { env } from "./config/env";
import { prisma } from "./db/prisma";
import { ensureElasticsearchIndex } from "./config/elastic";
import { validateEtherealConfig } from "./utils/ethereal";
import { startEmailWorker } from "./queues/worker";
import { reconcileOnStartup } from "./services/reconciliationService";
import { logger } from "./utils/logger";

/**
 * Standalone worker process entry point.
 *
 * Use this to run the BullMQ worker separately from the API server in
 * production for independent scaling:
 *   npm run worker   (dev with tsx)
 *   npm run worker:prod  (compiled)
 *
 * It does NOT start the Express server — only the worker, reconciliation,
 * and Elasticsearch index check.
 */
async function main(): Promise<void> {
  logger.info("[worker-entry] Starting standalone BullMQ worker process...");

  validateEtherealConfig();
  await ensureElasticsearchIndex();
  await reconcileOnStartup();

  startEmailWorker();

  // Graceful shutdown.
  const shutdown = async (signal: string) => {
    logger.info(`[worker-entry] Received ${signal}, shutting down...`);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("[worker-entry] Fatal error:", { error: err.message });
  process.exit(1);
});
