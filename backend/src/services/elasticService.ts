import { elasticClient, ES_INDEX } from "../config/elastic";
import { logger } from "../utils/logger";
import type { Email } from "@prisma/client";

/**
 * Elasticsearch sync service.
 * Indexes/upserts an email document whenever the email state changes.
 */

export interface EmailDocument {
  id: string;
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

function toDocument(email: Email): EmailDocument {
  return {
    id: email.id,
    userId: email.userId,
    senderEmail: email.senderEmail,
    recipientEmail: email.recipientEmail,
    subject: email.subject,
    body: email.body,
    status: email.status,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt ? email.sentAt.toISOString() : null,
    createdAt: email.createdAt.toISOString(),
  };
}

/** Index or update an email document in Elasticsearch. */
export async function indexEmail(email: Email): Promise<void> {
  try {
    await elasticClient.index({
      index: ES_INDEX,
      id: email.id,
      body: toDocument(email),
      refresh: false, // async refresh for throughput
    });
    logger.debug(`[elastic] Indexed email ${email.id} (${email.status})`);
  } catch (err: unknown) {
    // Elasticsearch is a secondary index — don't fail the primary operation if ES is down.
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[elastic] Failed to index email ${email.id}: ${message}`);
  }
}

/** Remove an email document (e.g., on deletion). */
export async function removeEmailIndex(emailId: string): Promise<void> {
  try {
    await elasticClient.delete({ index: ES_INDEX, id: emailId });
  } catch (err: unknown) {
    const meta = err as { statusCode?: number };
    // 404 means the document wasn't indexed — that's fine, don't log as error.
    if (meta?.statusCode !== 404) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[elastic] Failed to delete email ${emailId}: ${message}`);
    }
  }
}

export interface SearchParams {
  query: string;
  status?: string;
  userId: string;
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

/**
 * Full-text search across recipientEmail, subject, and body.
 * Optionally filter by status.
 */
export async function searchEmails(params: SearchParams): Promise<SearchResult[]> {
  const { query, status, userId } = params;

  const must: Record<string, unknown>[] = [
    { term: { userId } },
  ];

  if (status && status !== "ALL") {
    must.push({ term: { status } });
  }

  if (query.trim()) {
    must.push({
      multi_match: {
        query,
        fields: ["recipientEmail^3", "subject^2", "body"],
        fuzziness: "AUTO",
      },
    });
  }

  const body = {
    query: {
      bool: { must },
    },
    sort: [{ scheduledAt: { order: "desc" } }],
    size: 50,
  };

  const result = await elasticClient.search({
    index: ES_INDEX,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: body as any,
  });

  const hits = result.hits?.hits ?? [];
  return hits
    .filter((hit) => hit._source != null)
    .map((hit) => {
      const src = hit._source as EmailDocument;
      return {
        id: src.id,
        recipientEmail: src.recipientEmail,
        senderEmail: src.senderEmail,
        subject: src.subject,
        body: src.body,
        status: src.status,
        scheduledAt: src.scheduledAt,
        sentAt: src.sentAt,
      };
    });
}
