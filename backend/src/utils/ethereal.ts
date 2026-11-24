import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";

export interface SenderConfig {
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}

/** Parse configured Ethereal accounts from env into sender configs. */
export function getEtherealSenders(): SenderConfig[] {
  return env.etherealAccounts.map((a) => ({
    email: a.email,
    smtpHost: a.host,
    smtpPort: a.port,
    smtpUser: a.user,
    smtpPass: a.pass,
  }));
}

/** Find a sender config by email address. */
export function findSender(email: string): SenderConfig | undefined {
  return getEtherealSenders().find((s) => s.email === email);
}

/** Create a Nodemailer transporter for a given sender. */
export function createTransporter(sender: SenderConfig) {
  return nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    auth: {
      user: sender.smtpUser,
      pass: sender.smtpPass,
    },
    secure: false,
    tls: { rejectUnauthorized: false },
  });
}

/** Get the list of sender emails available for the compose UI selector. */
export function getSenderList() {
  return getEtherealSenders().map((s) => ({
    email: s.email,
    smtpUser: s.smtpUser,
  }));
}

/** Validate that at least one Ethereal account is configured. */
export function validateEtherealConfig(): void {
  const senders = getEtherealSenders();
  if (senders.length === 0) {
    logger.warn(
      "No Ethereal accounts configured. Set ETHEREAL_ACCOUNTS_JSON with valid accounts from https://ethereal.email",
    );
  } else {
    logger.info(`[ethereal] ${senders.length} sender account(s) configured`);
  }
}
