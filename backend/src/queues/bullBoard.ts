import express from "express";
import { createBullBoard } from "@bull-board/express";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { emailQueue } from "./emailQueue";

/**
 * Bull Board dashboard mounted at /admin/queues.
 * Shows live active, delayed, waiting, completed, and failed jobs.
 */
export function mountBullBoard(app: express.Application): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
  });

  app.use("/admin/queues", serverAdapter.getRouter());
}
