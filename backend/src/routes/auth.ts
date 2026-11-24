import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { issueJwt } from "../auth/google";
import { getAuthUser, authMiddleware } from "../auth/middleware";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const router = Router();

/**
 * GET /api/auth/google
 * Redirects to Google OAuth consent screen.
 */
router.get("/google", (req: Request, res: Response, next: NextFunction) => {
  logger.info("[oauth] Starting Google OAuth flow");
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

/**
 * GET /api/auth/google/callback
 * Google redirects here after the user consents. We upsert the user
 * (done in the strategy), issue a JWT, and set it as an HTTP-only cookie.
 */
router.get(
  "/google/callback",
  (req: Request, res: Response, next: NextFunction) => {
    logger.info("[oauth] Callback received", {
      code: req.query.code ? "present" : "missing",
      state: req.query.state ? "present" : "missing",
      error: (req.query.error as string) || "none",
      hasSession: !!req.session,
    });
    passport.authenticate("google", (err: Error | null, user: unknown) => {
      if (err) {
        logger.error("[oauth] Passport error:", { message: err.message });
        return res.redirect(`${env.clientUrl}/?oauth_error=${encodeURIComponent(err.message)}`);
      }
      if (!user) {
        logger.error("[oauth] No user returned from Passport");
        return res.redirect(`${env.clientUrl}/?oauth_error=auth_failed`);
      }
      const authUser = user as { id: string };
      logger.info("[oauth] Success, user:", { id: authUser.id });
      const token = issueJwt(authUser.id);

      res.cookie("session", token, {
        httpOnly: true,
        secure: env.nodeEnv === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // Pass token via URL as fallback — some browsers block cookies in 302 redirects
      res.redirect(`${env.clientUrl}/?token=${token}`);
    })(req, res, next);
  },
);

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 * Uses authMiddleware so it works with both cookie and Bearer token.
 */
router.get("/me", authMiddleware, (req: Request, res: Response) => {
  const user = getAuthUser(req);
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
});

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("session");
  req.logout(() => {});
  res.json({ success: true });
});

/**
 * POST /api/auth/demo
 * Demo login that creates a test user and issues a JWT — no Google OAuth needed.
 * Lets you explore the dashboard immediately. Replace with real Google OAuth
 * for production use.
 */
router.post("/demo", async (_req: Request, res: Response) => {
  try {
    const demoUser = await prisma.user.upsert({
      where: { googleId: "demo-user" },
      create: {
        googleId: "demo-user",
        name: "Demo User",
        email: "demo@outbox.local",
        avatarUrl: null,
      },
      update: {},
    });

    const token = issueJwt(demoUser.id);

    res.cookie("session", token, {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        avatarUrl: demoUser.avatarUrl,
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
