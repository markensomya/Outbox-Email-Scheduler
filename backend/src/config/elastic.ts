import { Client } from "@elastic/elasticsearch";
import { env } from "./env";

export const elasticClient = new Client({
  node: env.elasticsearchUrl,
  requestTimeout: 30000,
  maxRetries: 3,
  sniffOnStart: false,
});

export const ES_INDEX = env.elasticsearchIndex;

/** Ensure the emails index exists with the correct mapping. Safe to call on every startup. */
export async function ensureElasticsearchIndex(): Promise<void> {
  try {
    const exists = await elasticClient.indices.exists({ index: ES_INDEX });
    if (exists) {
      console.log(`[elastic] Index "${ES_INDEX}" already exists`);
      return;
    }

    await elasticClient.indices.create({
      index: ES_INDEX,
      body: {
        mappings: {
          properties: {
            id: { type: "keyword" },
            userId: { type: "keyword" },
            senderEmail: { type: "keyword" },
            recipientEmail: {
              type: "text",
              analyzer: "standard",
              fields: {
                keyword: { type: "keyword", ignore_above: 256 },
              },
            },
            subject: { type: "text", analyzer: "standard" },
            body: { type: "text", analyzer: "standard" },
            status: { type: "keyword" },
            scheduledAt: { type: "date" },
            sentAt: { type: "date" },
            createdAt: { type: "date" },
          },
        },
      },
    });

    console.log(`[elastic] Created index "${ES_INDEX}"`);
  } catch (err: unknown) {
    // If Elasticsearch is not up yet, log and continue — the app should still boot.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[elastic] Failed to ensure index: ${message}`);
  }
}
