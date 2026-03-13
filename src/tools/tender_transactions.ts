// Tender Transactions tools — Shopify Admin API 2024-01
// Covers: list_tender_transactions

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyTenderTransaction {
  id: number;
  order_id?: number;
  amount?: string;
  currency?: string;
  user_id?: number | null;
  test?: boolean;
  processed_at?: string;
  remote_reference?: string | null;
  payment_details?: Record<string, unknown> | null;
  payment_method?: string;
}

// === Zod Schemas ===
const ListTenderTransactionsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  since_id: z.string().optional().describe("Return transactions after this ID"),
  processed_at_min: z.string().optional().describe("ISO8601 datetime filter"),
  processed_at_max: z.string().optional(),
  processed_at: z.string().optional(),
  order: z.string().optional().describe("Sort order (e.g. 'processed_at DESC')"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_tender_transactions",
      title: "List Tender Transactions",
      description: "List tender transactions — low-level payment records that capture how each payment was tendered (credit card, gift card, cash, etc.). Useful for reconciliation and accounting. Supports cursor pagination and date filtering.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          since_id: { type: "string" },
          processed_at_min: { type: "string", description: "ISO8601 filter start date" },
          processed_at_max: { type: "string", description: "ISO8601 filter end date" },
          order: { type: "string", description: "Sort order (e.g. 'processed_at DESC')" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_tender_transactions: async (args) => {
      const params = ListTenderTransactionsSchema.parse(args);
      let result: { data: ShopifyTenderTransaction[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_tender_transactions", () =>
          client.paginateFromCursor<ShopifyTenderTransaction>("/tender_transactions.json", params.page_info!, params.limit)
        , { tool: "list_tender_transactions" });
      } else {
        const extra: Record<string, string> = {};
        if (params.since_id) extra.since_id = params.since_id;
        if (params.processed_at_min) extra.processed_at_min = params.processed_at_min;
        if (params.processed_at_max) extra.processed_at_max = params.processed_at_max;
        if (params.order) extra.order = params.order;
        result = await logger.time("tool.list_tender_transactions", () =>
          client.paginatedGet<ShopifyTenderTransaction>("/tender_transactions.json", extra, params.limit)
        , { tool: "list_tender_transactions" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
