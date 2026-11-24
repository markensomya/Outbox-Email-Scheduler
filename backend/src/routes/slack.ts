import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  buildSlackAuthUrl,
  exchangeSlackCode,
  disconnectSlack,
  getSlackIntegration,
} from "../services/slackService";
import { authMiddleware } from "../auth/middleware";
import { env } from "../config/env";

const router = Router();

/**
 * GET /api/slack/auth
 * Redirects to Slack's OAuth authorize endpoint with chat:write and
 * incoming-webhook scopes.
 */
router.get("/auth", authMiddleware, (req: Request, res: Response) => {
  // State ties the callback to the authenticated user so we know whose
  // integration to store. We encode the userId in the state.
  const state = `${req.user!.id}:${randomUUID()}`;
  const authUrl = buildSlackAuthUrl(state);

  // Store state briefly in a cookie for validation on callback.
  res.cookie("slack_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  res.redirect(authUrl);
});

/**
 * GET /api/slack/callback
 * Slack redirects here with a code. We exchange it for an access token
 * and store the integration tied to the logged-in user.
 */
router.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`${env.clientUrl}/dashboard?slack_error=${error}`);
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing code parameter" });
    return;
  }

  // Extract the userId from the state (format: "userId:randomUUID").
  const stateStr = (state as string) || "";
  const userId = stateStr.split(":")[0];
  if (!userId) {
    res.status(400).json({ error: "Invalid state — could not determine user" });
    return;
  }

  // Validate the state against the cookie to prevent CSRF attacks.
  const cookieState = req.cookies?.slack_oauth_state;
  if (!cookieState || cookieState !== stateStr) {
    res.status(400).json({ error: "State validation failed — possible CSRF attempt" });
    return;
  }

  // Clear the state cookie.
  res.clearCookie("slack_oauth_state");

  try {
    await exchangeSlackCode(code, userId);
    res.redirect(`${env.clientUrl}/dashboard?slack_connected=true`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.redirect(`${env.clientUrl}/dashboard?slack_error=${encodeURIComponent(message)}`);
  }
});

/**
 * GET /api/slack/status
 * Returns whether the user has a Slack integration connected.
 */
router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  const integration = await getSlackIntegration(req.user!.id);
  res.json({
    connected: !!integration,
    channelName: integration?.channelName || null,
    teamName: integration?.teamName || null,
  });
});

/**
 * POST /api/slack/disconnect
 * Removes the Slack integration cleanly.
 */
router.post("/disconnect", authMiddleware, async (req: Request, res: Response) => {
  try {
    await disconnectSlack(req.user!.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
