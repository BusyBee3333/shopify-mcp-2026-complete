// Refunds tools — Shopify Admin API 2024-01
// Covers: list_refunds, create_refund, calculate_refund

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyRefund {
  id?: number;
  order_id?: number;
  created_at?: string;
  note?: string | null;
  restock?: boolean;
  user_id?: number | null;
  refund_line_items?: unknown[];
  transactions?: unknown[];
  order_adjustments?: unknown[];
}

// === Zod Schemas ===
const ListRefundsSchema = z.object({
  order_id: z.string().describe("Shopify order ID to list refunds for"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page (from previous response nextPageInfo)"),
});

const RefundLineItemSchema = z.object({
  line_item_id: z.number().describe("Line item ID to refund"),
  quantity: z.number().describe("Quantity to refund"),
  restock_type: z.enum(["no_restock", "cancel", "return", "legacy_restock"]).optional().describe("How to restock the item"),
  location_id: z.number().optional().describe("Location ID for restocking"),
});

const CreateRefundSchema = z.object({
  order_id: z.string().describe("Shopify order ID to refund"),
  note: z.string().optional().describe("Internal note about the refund"),
  notify: z.boolean().optional().default(false).describe("Send refund notification email to customer"),
  shipping: z.object({
    full_refund: z.boolean().optional().describe("Refund full shipping amount"),
    amount: z.string().optional().describe("Specific shipping amount to refund"),
  }).optional().describe("Shipping refund details"),
  refund_line_items: z.array(RefundLineItemSchema).optional().describe("Line items to refund"),
  transactions: z.array(z.object({
    parent_id: z.number().describe("Parent transaction ID (from order.transactions)"),
    amount: z.string().describe("Amount to refund"),
    kind: z.enum(["refund"]).default("refund"),
    gateway: z.string().optional().describe("Payment gateway"),
  })).optional().describe("Transactions for the refund payment"),
});

const CalculateRefundSchema = z.object({
  order_id: z.string().describe("Shopify order ID to calculate refund for"),
  shipping: z.object({
    full_refund: z.boolean().optional().describe("Refund full shipping"),
    amount: z.string().optional().describe("Specific shipping amount to refund"),
  }).optional().describe("Shipping to include in calculation"),
  refund_line_items: z.array(RefundLineItemSchema).optional().describe("Line items to include in calculation"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_refunds",
      title: "List Refunds",
      description:
        "List all refunds for a specific Shopify order. Returns refund details including line items refunded, transactions, and timestamps. Supports cursor-based pagination. Use when reviewing refund history for an order.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
        required: ["order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: { count: { type: "number" }, hasMore: { type: "boolean" } },
          },
        },
        required: ["data", "meta"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "calculate_refund",
      title: "Calculate Refund",
      description:
        "Calculate a refund for a Shopify order without actually creating it. Returns the suggested refund amounts including taxes and shipping. Use to preview refund amounts before creating the actual refund.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          shipping: {
            type: "object",
            description: "Shipping refund options",
            properties: {
              full_refund: { type: "boolean" },
              amount: { type: "string" },
            },
          },
          refund_line_items: {
            type: "array",
            description: "Line items to calculate refund for",
            items: {
              type: "object",
              properties: {
                line_item_id: { type: "number" },
                quantity: { type: "number" },
                restock_type: { type: "string", enum: ["no_restock", "cancel", "return", "legacy_restock"] },
              },
              required: ["line_item_id", "quantity"],
            },
          },
        },
        required: ["order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          refund_line_items: { type: "array" },
          transactions: { type: "array" },
          shipping: { type: "object" },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "create_refund",
      title: "Create Refund",
      description:
        "Create a refund for a Shopify order. Use calculate_refund first to preview amounts. Specify line items to refund, shipping to refund, and transactions for repayment. Returns the created refund.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          note: { type: "string", description: "Internal note about the refund" },
          notify: { type: "boolean", description: "Send notification to customer" },
          shipping: {
            type: "object",
            description: "Shipping refund",
            properties: {
              full_refund: { type: "boolean" },
              amount: { type: "string" },
            },
          },
          refund_line_items: {
            type: "array",
            description: "Line items to refund",
            items: {
              type: "object",
              properties: {
                line_item_id: { type: "number" },
                quantity: { type: "number" },
                restock_type: { type: "string", enum: ["no_restock", "cancel", "return", "legacy_restock"] },
                location_id: { type: "number" },
              },
              required: ["line_item_id", "quantity"],
            },
          },
          transactions: {
            type: "array",
            description: "Refund payment transactions",
            items: {
              type: "object",
              properties: {
                parent_id: { type: "number" },
                amount: { type: "string" },
                kind: { type: "string" },
                gateway: { type: "string" },
              },
              required: ["parent_id", "amount"],
            },
          },
        },
        required: ["order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          order_id: { type: "number" },
          created_at: { type: "string" },
          refund_line_items: { type: "array" },
          transactions: { type: "array" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_refunds: async (args) => {
      const params = ListRefundsSchema.parse(args);
      let result: { data: ShopifyRefund[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_refunds", () =>
          client.paginateFromCursor<ShopifyRefund>(
            `/orders/${params.order_id}/refunds.json`,
            params.page_info!,
            params.limit
          )
        , { tool: "list_refunds" });
      } else {
        result = await logger.time("tool.list_refunds", () =>
          client.paginatedGet<ShopifyRefund>(
            `/orders/${params.order_id}/refunds.json`,
            {},
            params.limit
          )
        , { tool: "list_refunds" });
      }

      const response = {
        data: result.data,
        meta: {
          count: result.data.length,
          hasMore: !!result.nextPageInfo,
          ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    calculate_refund: async (args) => {
      const { order_id, ...params } = CalculateRefundSchema.parse(args);
      const body: Record<string, unknown> = {};
      if (params.shipping) body.shipping = params.shipping;
      if (params.refund_line_items) body.refund_line_items = params.refund_line_items;

      const data = await logger.time("tool.calculate_refund", () =>
        client.post<{ refund: ShopifyRefund }>(
          `/orders/${order_id}/refunds/calculate.json`,
          { refund: body }
        )
      , { tool: "calculate_refund", order_id });

      const refund = (data as { refund: ShopifyRefund }).refund;

      return {
        content: [{ type: "text", text: JSON.stringify(refund, null, 2) }],
        structuredContent: refund,
      };
    },

    create_refund: async (args) => {
      const { order_id, ...params } = CreateRefundSchema.parse(args);
      const body: Record<string, unknown> = {};
      if (params.note) body.note = params.note;
      if (params.notify !== undefined) body.notify = params.notify;
      if (params.shipping) body.shipping = params.shipping;
      if (params.refund_line_items) body.refund_line_items = params.refund_line_items;
      if (params.transactions) body.transactions = params.transactions;

      const data = await logger.time("tool.create_refund", () =>
        client.post<{ refund: ShopifyRefund }>(
          `/orders/${order_id}/refunds.json`,
          { refund: body }
        )
      , { tool: "create_refund", order_id });

      const refund = (data as { refund: ShopifyRefund }).refund;

      return {
        content: [{ type: "text", text: JSON.stringify(refund, null, 2) }],
        structuredContent: refund,
      };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return {
    tools: getToolDefinitions(),
    handlers: getToolHandlers(client),
  };
}
