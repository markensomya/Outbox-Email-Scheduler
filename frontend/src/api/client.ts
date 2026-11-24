/**
 * API client for the Outbox backend.
 * Uses cookie-based auth (credentials: include) for all requests.
 *
 * In development: set VITE_API_URL=http://localhost:4000 in frontend/.env
 * In production: leave VITE_API_URL unset so it defaults to the same origin
 * (the backend serves the frontend as static files).
 */

const API_URL =
  (import.meta.env.VITE_API_URL as string) ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:4000");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorBody.error || `Request failed: ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Sender {
  email: string;
  smtpUser: string;
}

export interface EmailRecord {
  id: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  etherealPreviewUrl: string | null;
  failReason: string | null;
}

export interface EmailCounts {
  scheduled: number;
  sent: number;
  failed: number;
  rateLimited: number;
}

export interface SearchResult {
  id: string;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
}

export interface SlackStatus {
  connected: boolean;
  channelName: string | null;
  teamName: string | null;
}

export const api = {
  auth: {
    me: () => request<{ user: User }>("/api/auth/me"),
    logout: () => request<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
  },

  emails: {
    senders: () => request<{ senders: Sender[] }>("/api/emails/senders"),
    schedule: (data: {
      senderEmail: string;
      recipients: string[];
      subject: string;
      body: string;
      scheduledAt: string;
      hourlyLimit: number;
      minDelaySeconds: number;
      idempotencyKey?: string;
    }) =>
      request("/api/emails/schedule", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    list: (status: string, page = 1, limit = 50) =>
      request<{ emails: EmailRecord[]; total: number }>(
        `/api/emails?status=${status}&page=${page}&limit=${limit}`,
      ),
    counts: () => request<EmailCounts>("/api/emails/counts"),
    search: (q: string, status = "ALL") =>
      request<{ results: SearchResult[]; total: number }>(
        `/api/emails/search?q=${encodeURIComponent(q)}&status=${status}`,
      ),
  },

  slack: {
    authUrl: () => `${API_URL}/api/slack/auth`,
    status: () => request<SlackStatus>("/api/slack/status"),
    disconnect: () => request<{ success: boolean }>("/api/slack/disconnect", { method: "POST" }),
  },
};

export { API_URL };
