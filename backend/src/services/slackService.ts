import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Slack OAuth 2.0 flow + chat.postMessage notification sender.
 */

const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";

/** Build the Slack OAuth authorize redirect URL. */
export function buildSlackAuthUrl(state: string): string {
  const scopes = ["chat:write", "incoming-webhook"];
  const params = new URLSearchParams({
    client_id: env.slackClientId,
    scope: scopes.join(","),
    redirect_uri: env.slackRedirectUri,
    state,
  });
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchange the OAuth code for an access token and store it. */
export async function exchangeSlackCode(code: string, userId: string) {
  const body = new URLSearchParams({
    client_id: env.slackClientId,
    client_secret: env.slackClientSecret,
    code,
    redirect_uri: env.slackRedirectUri,
  });

  const response = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    authed_user?: { access_token?: string };
    incoming_webhook?: { channel_id?: string; channel?: string };
    team?: { name?: string };
  };

  if (!data.ok || !data.access_token) {
    throw new Error(`Slack token exchange failed: ${data.error || "unknown error"}`);
  }

  // Prefer the bot-level access_token; fall back to user token.
  const accessToken = data.access_token || data.authed_user?.access_token || "";
  const channelId = data.incoming_webhook?.channel_id || "";
  const channelName = data.incoming_webhook?.channel || null;
  const teamName = data.team?.name || null;

  // Upsert the integration for this user.
  const integration = await prisma.slackIntegration.upsert({
    where: { userId },
    create: {
      userId,
      accessToken,
      channelId,
      channelName,
      teamName,
    },
    update: {
      accessToken,
      channelId,
      channelName,
      teamName,
    },
  });

  logger.info(`[slack] Connected for user ${userId} (channel: ${channelName || channelId})`);
  return integration;
}

/** Remove the Slack integration for a user. */
export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackIntegration.deleteMany({ where: { userId } });
  logger.info(`[slack] Disconnected for user ${userId}`);
}

/** Get the Slack integration for a user (or null if not connected). */
export async function getSlackIntegration(userId: string) {
  return prisma.slackIntegration.findUnique({ where: { userId } });
}

export interface RateLimitAlertPayload {
  senderEmail: string;
  rescheduledCount: number;
  nextWindowOpensAt: Date;
}

/**
 * Send a rate-limit alert to the user's Slack channel.
 * Gracefully skips if Slack is not connected (zero errors).
 */
export async function sendRateLimitAlert(userId: string, payload: RateLimitAlertPayload): Promise<void> {
  try {
    const integration = await getSlackIntegration(userId);
    if (!integration) {
      // Slack not connected — skip silently.
      logger.debug(`[slack] No integration for user ${userId}, skipping alert`);
      return;
    }

    const nextWindowStr = payload.nextWindowOpensAt.toUTCString();
    const message = [
      `🚨 *Hourly Rate Limit Reached*`,
      ``,
      `*Sender:* ${payload.senderEmail}`,
      `*Emails rescheduled:* ${payload.rescheduledCount}`,
      `*Next window opens:* ${nextWindowStr}`,
      ``,
      `These emails have been safely moved to the next hour window.`,
    ].join("\n");

    const body = JSON.stringify({
      channel: integration.channelId,
      text: message,
    });

    const response = await fetch(SLACK_POST_MESSAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${integration.accessToken}`,
      },
      body,
    });

    const result = (await response.json()) as { ok: boolean; error?: string };

    if (!result.ok) {
      logger.warn(`[slack] chat.postMessage returned error: ${result.error}`);
    } else {
      logger.info(
        `[slack] Rate-limit alert sent to ${integration.channelName || integration.channelId} for sender ${payload.senderEmail}`,
      );
    }
  } catch (err: unknown) {
    // Never let Slack failures break the email pipeline.
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[slack] Failed to send rate-limit alert: ${message}`);
  }
}
