// Payouts & Balance tools — Shopify Payments Admin API 2024-01
// Covers: list_payouts, get_payout, list_balance_transactions

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyPayout {
  id: number;
  status?: string;
  date?: string;
  currency?: string;
  amount?: string;
  summary?: {
    adjustments_fee_amount?: string;
    adjustments_gross_amount?: string;
    charges_fee_amount?: string;
    charges_gross_amount?: string;
    refunds_fee_amount?: string;
    refunds_gross_amount?: string;
    reserved_funds_fee_amount?: string;
    reserved_funds_gross_amount?: string;
    retried_payouts_fee_amount?: string;
    retried_payouts_gross_amount?: string;
  };
}

interface ShopifyBalanceTransaction {
  id: number;
  type?: string;
  test?: boolean;
  payout_id?: number | null;
  payout_status?: string | null;
  currency?: string;
  amount?: string;
  fee?: string;
  net?: string;
  source_id?: number;
  source_type?: string;
  source_order_id?: number | null;
  source_order_transaction_id?: number | null;
  processed_at?: string;
}

// === Zod Schemas ===
const ListPayoutsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  since_id: z.string().optional(),
  status: z.enum(["scheduled", "in_transit", "paid", "failed", "cancelled"]).optional(),
  date_min: z.string().optional().describe("Filter by payout date (YYYY-MM-DD)"),
  date_max: z.string().optional(),
  date: z.string().optional().describe("Exact payout date (YYYY-MM-DD)"),
});

const GetPayoutSchema = z.object({ payout_id: z.string() });

const ListBalanceTransactionsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  since_id: z.string().optional(),
  payout_id: z.string().optional().describe("Filter transactions for a specific payout"),
  payout_status: z.enum(["scheduled", "in_transit", "paid", "failed", "cancelled"]).optional(),
  test: z.boolean().optional(),
  processed_at_min: z.string().optional(),
  processed_at_max: z.string().optional(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_payouts",
      title: "List Shopify Payments Payouts",
      description: "List Shopify Payments payouts — money transfers from Shopify to the merchant's bank account. Filter by status or date range. Requires Shopify Payments to be active on the store.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          since_id: { type: "string" },
          status: { type: "string", enum: ["scheduled", "in_transit", "paid", "failed", "cancelled"] },
          date_min: { type: "string" },
          date_max: { type: "string" },
          date: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_payout",
      title: "Get Payout",
      description: "Get details for a specific Shopify Payments payout, including a summary of charges, refunds, adjustments, and fees included in the payout.",
      inputSchema: {
        type: "object",
        properties: { payout_id: { type: "string" } },
        required: ["payout_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_balance_transactions",
      title: "List Balance Transactions",
      description: "List individual balance transactions for Shopify Payments. Each transaction represents a charge, refund, or adjustment that affects the balance. Filter by payout to see what's included in a specific transfer.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          since_id: { type: "string" },
          payout_id: { type: "string" },
          payout_status: { type: "string" },
          test: { type: "boolean" },
          processed_at_min: { type: "string" },
          processed_at_max: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_payouts: async (args) => {
      const params = ListPayoutsSchema.parse(args);
      let result: { data: ShopifyPayout[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_payouts", () =>
          client.paginateFromCursor<ShopifyPayout>("/shopify_payments/payouts.json", params.page_info!, params.limit)
        , { tool: "list_payouts" });
      } else {
        const extra: Record<string, string> = {};
        if (params.since_id) extra.since_id = params.since_id;
        if (params.status) extra.status = params.status;
        if (params.date_min) extra.date_min = params.date_min;
        if (params.date_max) extra.date_max = params.date_max;
        if (params.date) extra.date = params.date;
        result = await logger.time("tool.list_payouts", () =>
          client.paginatedGet<ShopifyPayout>("/shopify_payments/payouts.json", extra, params.limit)
        , { tool: "list_payouts" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_payout: async (args) => {
      const { payout_id } = GetPayoutSchema.parse(args);
      const data = await logger.time("tool.get_payout", () =>
        client.get<{ payout: ShopifyPayout }>(`/shopify_payments/payouts/${payout_id}.json`)
      , { tool: "get_payout" });
      const payout = (data as { payout: ShopifyPayout }).payout;
      return { content: [{ type: "text", text: JSON.stringify(payout, null, 2) }], structuredContent: payout };
    },

    list_balance_transactions: async (args) => {
      const params = ListBalanceTransactionsSchema.parse(args);
      let result: { data: ShopifyBalanceTransaction[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_balance_transactions", () =>
          client.paginateFromCursor<ShopifyBalanceTransaction>("/shopify_payments/balance/transactions.json", params.page_info!, params.limit)
        , { tool: "list_balance_transactions" });
      } else {
        const extra: Record<string, string> = {};
        if (params.since_id) extra.since_id = params.since_id;
        if (params.payout_id) extra.payout_id = params.payout_id;
        if (params.payout_status) extra.payout_status = params.payout_status;
        if (params.processed_at_min) extra.processed_at_min = params.processed_at_min;
        if (params.processed_at_max) extra.processed_at_max = params.processed_at_max;
        if (params.test !== undefined) extra.test = String(params.test);
        result = await logger.time("tool.list_balance_transactions", () =>
          client.paginatedGet<ShopifyBalanceTransaction>("/shopify_payments/balance/transactions.json", extra, params.limit)
        , { tool: "list_balance_transactions" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
