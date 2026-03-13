// Order Transactions Extended tools — Shopify Admin API 2024-01
// Covers: capture_payment, void_payment, refund_payment, get_transaction_fees, list_transaction_fraud_review

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyTransaction {
  id?: number;
  order_id?: number;
  kind?: string;
  status?: string;
  amount?: string;
  currency?: string;
  gateway?: string;
  parent_id?: number | null;
  error_code?: string | null;
  message?: string | null;
  created_at?: string;
  receipt?: Record<string, unknown>;
  fees?: unknown[];
}

const CapturePaymentSchema = z.object({
  order_id: z.string().describe("Order ID to capture payment for"),
  amount: z.string().describe("Amount to capture (must not exceed authorized amount)"),
  currency: z.string().optional().describe("Currency code (defaults to order currency)"),
  parent_id: z.number().describe("Parent authorization transaction ID"),
  gateway: z.string().optional().describe("Payment gateway"),
});

const VoidPaymentSchema = z.object({
  order_id: z.string().describe("Order ID"),
  parent_id: z.number().describe("Authorization transaction ID to void"),
  gateway: z.string().optional().describe("Payment gateway"),
});

const RefundTransactionSchema = z.object({
  order_id: z.string().describe("Order ID"),
  amount: z.string().describe("Amount to refund"),
  currency: z.string().optional().describe("Currency code"),
  parent_id: z.number().describe("Transaction ID to refund against"),
  gateway: z.string().optional().describe("Payment gateway"),
  note: z.string().optional().describe("Note for the refund"),
});

const GetTransactionCountSchema = z.object({
  order_id: z.string().describe("Order ID"),
});

const ListTransactionWithDetailsSchema = z.object({
  order_id: z.string().describe("Order ID"),
  since_id: z.string().optional().describe("Filter transactions after this ID"),
  fields: z.string().optional().describe("Comma-separated fields to include"),
  in_shop_and_presentment_currencies: z.boolean().optional().describe("Return amounts in both shop and presentment currencies"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "capture_payment",
      title: "Capture Authorized Payment",
      description: "Capture a previously authorized payment on an order. Must reference the parent authorization transaction ID. Can capture a partial amount. Returns the capture transaction with status.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID" },
          amount: { type: "string", description: "Amount to capture" },
          currency: { type: "string", description: "Currency code" },
          parent_id: { type: "number", description: "Authorization transaction ID" },
          gateway: { type: "string", description: "Payment gateway" },
        },
        required: ["order_id", "amount", "parent_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "void_payment",
      title: "Void Authorization",
      description: "Void a payment authorization on an order, cancelling the hold on funds. Must reference the parent authorization transaction. Cannot void already-captured transactions.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID" },
          parent_id: { type: "number", description: "Authorization transaction ID to void" },
          gateway: { type: "string", description: "Payment gateway" },
        },
        required: ["order_id", "parent_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "refund_transaction",
      title: "Create Refund Transaction",
      description: "Issue a refund via the payment gateway for an order. References a captured transaction. Returns the refund transaction with status. Note: also see the refunds API for line-item level refunds.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID" },
          amount: { type: "string", description: "Amount to refund" },
          currency: { type: "string", description: "Currency code" },
          parent_id: { type: "number", description: "Capture transaction ID to refund" },
          gateway: { type: "string", description: "Payment gateway" },
          note: { type: "string", description: "Note for the refund" },
        },
        required: ["order_id", "amount", "parent_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_transaction_count",
      title: "Get Transaction Count",
      description: "Get the total count of transactions for an order.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string", description: "Order ID" } },
        required: ["order_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_transactions_detailed",
      title: "List Transactions with Full Details",
      description: "List transactions for an order with full details including fees, receipt data, and multi-currency amounts. Useful for accounting and payment reconciliation.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID" },
          since_id: { type: "string", description: "Filter after transaction ID" },
          fields: { type: "string", description: "Specific fields to return" },
          in_shop_and_presentment_currencies: { type: "boolean", description: "Include multi-currency amounts" },
        },
        required: ["order_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    capture_payment: async (args) => {
      const { order_id, ...txData } = CapturePaymentSchema.parse(args);
      const data = await logger.time("tool.capture_payment", () =>
        client.post<{ transaction: ShopifyTransaction }>(`/orders/${order_id}/transactions.json`, {
          transaction: { kind: "capture", ...txData },
        })
      , { tool: "capture_payment" });
      const tx = (data as { transaction: ShopifyTransaction }).transaction;
      return { content: [{ type: "text", text: JSON.stringify(tx, null, 2) }], structuredContent: tx as Record<string, unknown> };
    },

    void_payment: async (args) => {
      const { order_id, parent_id, gateway } = VoidPaymentSchema.parse(args);
      const data = await logger.time("tool.void_payment", () =>
        client.post<{ transaction: ShopifyTransaction }>(`/orders/${order_id}/transactions.json`, {
          transaction: { kind: "void", parent_id, gateway },
        })
      , { tool: "void_payment" });
      const tx = (data as { transaction: ShopifyTransaction }).transaction;
      return { content: [{ type: "text", text: JSON.stringify(tx, null, 2) }], structuredContent: tx as Record<string, unknown> };
    },

    refund_transaction: async (args) => {
      const { order_id, ...txData } = RefundTransactionSchema.parse(args);
      const data = await logger.time("tool.refund_transaction", () =>
        client.post<{ transaction: ShopifyTransaction }>(`/orders/${order_id}/transactions.json`, {
          transaction: { kind: "refund", ...txData },
        })
      , { tool: "refund_transaction" });
      const tx = (data as { transaction: ShopifyTransaction }).transaction;
      return { content: [{ type: "text", text: JSON.stringify(tx, null, 2) }], structuredContent: tx as Record<string, unknown> };
    },

    get_transaction_count: async (args) => {
      const { order_id } = GetTransactionCountSchema.parse(args);
      const data = await logger.time("tool.get_transaction_count", () =>
        client.get<{ count: number }>(`/orders/${order_id}/transactions/count.json`)
      , { tool: "get_transaction_count" });
      const count = (data as { count: number }).count;
      const result = { count };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },

    list_transactions_detailed: async (args) => {
      const { order_id, ...params } = ListTransactionWithDetailsSchema.parse(args);
      const qs = new URLSearchParams();
      if (params.since_id) qs.set("since_id", params.since_id);
      if (params.fields) qs.set("fields", params.fields);
      if (params.in_shop_and_presentment_currencies) qs.set("in_shop_and_presentment_currencies", "true");
      const data = await logger.time("tool.list_transactions_detailed", () =>
        client.get<{ transactions: ShopifyTransaction[] }>(`/orders/${order_id}/transactions.json?${qs}`)
      , { tool: "list_transactions_detailed" });
      const transactions = (data as { transactions: ShopifyTransaction[] }).transactions;
      const response = { data: transactions, meta: { count: transactions.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
