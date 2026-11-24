import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import path from "path";
import fs from "fs";
import { env } from "./config/env";
import { configureGoogleAuth } from "./auth/google";
import { mountBullBoard } from "./queues/bullBoard";
import authRoutes from "./routes/auth";
import emailRoutes from "./routes/emails";
import slackRoutes from "./routes/slack";
import searchRoutes from "./routes/search";

/**
 * Express application factory.
 * Configures middleware, auth, routes, and the Bull Board dashboard.
 */
export function createApp(): express.Application {
  const app = express();

  // ── Core middleware ──
  app.use(
    cors({
      origin: env.clientUrl,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  app.use(
    session({
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: env.nodeEnv === "production",
        sameSite: "lax",
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());
  configureGoogleAuth();

  // ── Routes ──
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  // Mount search routes BEFORE email routes to avoid the /api/emails
  // catch-all router intercepting /api/emails/search.
  app.use("/api/emails/search", searchRoutes);
  app.use("/api/emails", emailRoutes);
  app.use("/api/slack", slackRoutes);

  // ── Bull Board dashboard ──
  mountBullBoard(app);

  // ── Serve frontend static files in production ──
  // The Dockerfile copies the built frontend to /app/public.
  // In development this directory doesn't exist, so we skip it.
  const frontendDir = path.resolve(__dirname, "../public");
  if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    // SPA fallback: serve index.html for any non-API, non-admin route.
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/admin/")) {
        return next();
      }
      res.sendFile(path.join(frontendDir, "index.html"));
    });
  }

  // ── 404 handler (API routes that didn't match) ──
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // ── Error handler ──
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[app] Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
