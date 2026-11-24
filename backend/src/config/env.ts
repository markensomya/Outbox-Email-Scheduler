import dotenv from "dotenv";

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

interface EtherealAccount {
  email: string;
  user: string;
  pass: string;
  host: string;
  port: number;
}

function parseEtherealAccounts(): EtherealAccount[] {
  const raw = required("ETHEREAL_ACCOUNTS_JSON", "[]");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a: EtherealAccount) => ({
      email: a.email,
      user: a.user,
      pass: a.pass,
      host: a.host || "smtp.ethereal.email",
      port: a.port || 587,
    }));
  } catch {
    console.warn("[env] Failed to parse ETHEREAL_ACCOUNTS_JSON, using empty array");
    return [];
  }
}

export const env = {
  port: num("PORT", 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  clientUrl: required("CLIENT_URL", "http://localhost:5173"),

  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),

  elasticsearchUrl: required("ELASTICSEARCH_URL", "http://localhost:9200"),
  elasticsearchIndex: required("ELASTICSEARCH_INDEX", "emails"),

  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
  googleCallbackUrl: required("GOOGLE_CALLBACK_URL", "http://localhost:4000/api/auth/google/callback"),

  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  jwtExpiresIn: required("JWT_EXPIRES_IN", "7d"),

  slackClientId: required("SLACK_CLIENT_ID", ""),
  slackClientSecret: required("SLACK_CLIENT_SECRET", ""),
  slackRedirectUri: required("SLACK_REDIRECT_URI", "http://localhost:4000/api/slack/callback"),

  sessionSecret: required("SESSION_SECRET", "dev-session-secret"),

  etherealAccounts: parseEtherealAccounts(),

  workerConcurrency: num("WORKER_CONCURRENCY", 5),
  minDelayBetweenEmailsMs: num("MIN_DELAY_BETWEEN_EMAILS_MS", 2000),
  maxEmailsPerHourPerSender: num("MAX_EMAILS_PER_HOUR_PER_SENDER", 100),
};

export type Env = typeof env;
