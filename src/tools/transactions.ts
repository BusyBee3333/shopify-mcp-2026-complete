// Transactions tools — Shopify Admin API 2024-01
// Covers: list_transactions, get_transaction, create_transaction (capture/void/refund)

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyTransaction {
  id: number;
  order_id: number;
  kind: string;
  status: string;
  amount: string;
  currency?: string;
  gateway?: string;
  authorization?: string | null;
  parent_id?: number | null;
  processed_at?: string;
  created_at?: string;
  error_code?: string | null;
  message?: string | null;
  receipt?: Record<string, unknown>;
  payment_details?: Record<string, unknown>;
}

// === Zod Schemas ===
const ListTransactionsSchema = z.object({
  order_id: z.string().describe("Order ID to list transactions for"),
  limit: z.number().min(1).max(250).optional().default(50),
  since_id: z.string().optional().describe("Return transactions after this ID"),
  fields: z.string().optional().describe("Comma-separated fields to return"),
});

const GetTransactionSchema = z.object({
  order_id: z.string(),
  transaction_id: z.string(),
});

const CreateTransactionSchema = z.object({
  order_id: z.string(),
  kind: z.enum(["authorization", "capture", "sale", "void", "refund"]).describe("Transaction type"),
  amount: z.string().optional().describe("Amount to capture/refund (required for capture/refund)"),
  currency: z.string().optional().describe("3-letter ISO currency code"),
  parent_id: z.number().optional().describe("Parent transaction ID (required for capture/void/refund)"),
  gateway: z.string().optional().describe("Payment gateway to use"),
  source: z.string().optional().describe("Transaction source"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_transactions",
      title: "List Order Transactions",
      description: "List all financial transactions for an order (authorizations, captures, refunds, voids). Returns amount, status, gateway, and transaction kind.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          limit: { type: "number" },
          since_id: { type: "string" },
          fields: { type: "string" },
        },
        required: ["order_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_transaction",
      title: "Get Transaction",
      description: "Get a specific transaction by ID for an order.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          transaction_id: { type: "string" },
        },
        required: ["order_id", "transaction_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_transaction",
      title: "Create Order Transaction",
      description: "Create a transaction on an order — use to capture an authorized payment, void an authorization, or issue a partial/full refund via the payment gateway. Common kinds: 'capture' (collect authorized payment), 'void' (cancel authorization), 'refund' (return funds).",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          kind: { type: "string", enum: ["authorization", "capture", "sale", "void", "refund"] },
          amount: { type: "string" },
          currency: { type: "string" },
          parent_id: { type: "number" },
          gateway: { type: "string" },
          source: { type: "string" },
        },
        required: ["order_id", "kind"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_transactions: async (args) => {
      const params = ListTransactionsSchema.parse(args);
      const qs = new URLSearchParams({ limit: String(params.limit) });
      if (params.since_id) qs.set("since_id", params.since_id);
      if (params.fields) qs.set("fields", params.fields);
      const data = await logger.time("tool.list_transactions", () =>
        client.get<{ transactions: ShopifyTransaction[] }>(`/orders/${params.order_id}/transactions.json?${qs}`)
      , { tool: "list_transactions" });
      const transactions = (data as { transactions: ShopifyTransaction[] }).transactions;
      const response = { data: transactions, meta: { count: transactions.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_transaction: async (args) => {
      const { order_id, transaction_id } = GetTransactionSchema.parse(args);
      const data = await logger.time("tool.get_transaction", () =>
        client.get<{ transaction: ShopifyTransaction }>(`/orders/${order_id}/transactions/${transaction_id}.json`)
      , { tool: "get_transaction" });
      const transaction = (data as { transaction: ShopifyTransaction }).transaction;
      return { content: [{ type: "text", text: JSON.stringify(transaction, null, 2) }], structuredContent: transaction };
    },

    create_transaction: async (args) => {
      const { order_id, ...txData } = CreateTransactionSchema.parse(args);
      const data = await logger.time("tool.create_transaction", () =>
        client.post<{ transaction: ShopifyTransaction }>(`/orders/${order_id}/transactions.json`, { transaction: txData })
      , { tool: "create_transaction" });
      const transaction = (data as { transaction: ShopifyTransaction }).transaction;
      return { content: [{ type: "text", text: JSON.stringify(transaction, null, 2) }], structuredContent: transaction };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
