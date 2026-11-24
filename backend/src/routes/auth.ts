import { Router, Request, Response } from "express";
import passport from "passport";
import { issueJwt } from "../auth/google";
import { getAuthUser } from "../auth/middleware";
import { env } from "../config/env";

const router = Router();

/**
 * GET /api/auth/google
 * Redirects to Google OAuth consent screen.
 */
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

/**
 * GET /api/auth/google/callback
 * Google redirects here after the user consents. We upsert the user
 * (done in the strategy), issue a JWT, and set it as an HTTP-only cookie.
 */
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: `${env.clientUrl}/login` }),
  (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const token = issueJwt(user.id);

    res.cookie("session", token, {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: env.nodeEnv === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect(`${env.clientUrl}/dashboard`);
  },
);

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 */
router.get("/me", (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
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

export default router;
