// Disputes (Shopify Payments) tools — Shopify Admin API 2024-01
// Covers: list_disputes, get_dispute

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyDispute {
  id: number;
  order_id?: number | null;
  type?: string;
  amount?: string;
  currency?: string;
  reason?: string;
  network_reason_code?: string | null;
  status?: string;
  evidence_due_by?: string | null;
  evidence_sent_on?: string | null;
  finalized_on?: string | null;
  initiated_at?: string;
}

// === Zod Schemas ===
const ListDisputesSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  since_id: z.string().optional(),
  status: z.enum(["needs_response", "under_review", "charge_refunded", "accepted", "won", "lost"]).optional().describe("Filter by dispute status"),
  initiated_at: z.string().optional().describe("Filter by initiation date (ISO8601)"),
});

const GetDisputeSchema = z.object({
  dispute_id: z.string().describe("Dispute ID"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_disputes",
      title: "List Shopify Payments Disputes",
      description: "List payment disputes (chargebacks) for stores using Shopify Payments. Filter by status to find disputes that need a response. Returns amount, reason, evidence deadline, and current status.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          since_id: { type: "string" },
          status: { type: "string", enum: ["needs_response", "under_review", "charge_refunded", "accepted", "won", "lost"] },
          initiated_at: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_dispute",
      title: "Get Dispute",
      description: "Get full details for a specific Shopify Payments dispute, including the reason, amount, evidence deadline, and current status.",
      inputSchema: {
        type: "object",
        properties: { dispute_id: { type: "string" } },
        required: ["dispute_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_disputes: async (args) => {
      const params = ListDisputesSchema.parse(args);
      let result: { data: ShopifyDispute[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_disputes", () =>
          client.paginateFromCursor<ShopifyDispute>("/shopify_payments/disputes.json", params.page_info!, params.limit)
        , { tool: "list_disputes" });
      } else {
        const extra: Record<string, string> = {};
        if (params.since_id) extra.since_id = params.since_id;
        if (params.status) extra.status = params.status;
        if (params.initiated_at) extra.initiated_at = params.initiated_at;
        result = await logger.time("tool.list_disputes", () =>
          client.paginatedGet<ShopifyDispute>("/shopify_payments/disputes.json", extra, params.limit)
        , { tool: "list_disputes" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_dispute: async (args) => {
      const { dispute_id } = GetDisputeSchema.parse(args);
      const data = await logger.time("tool.get_dispute", () =>
        client.get<{ dispute: ShopifyDispute }>(`/shopify_payments/disputes/${dispute_id}.json`)
      , { tool: "get_dispute" });
      const dispute = (data as { dispute: ShopifyDispute }).dispute;
      return { content: [{ type: "text", text: JSON.stringify(dispute, null, 2) }], structuredContent: dispute };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
