// Orders tools — Shopify Admin API 2024-01
// Covers: list_orders, get_order, create_order, update_order

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler, ShopifyOrder } from "../types.js";
import { logger } from "../logger.js";

// === Zod Schemas ===
const ListOrdersSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  status: z.enum(["open", "closed", "cancelled", "any"]).optional().default("any").describe("Filter by order status"),
  financial_status: z.enum(["authorized", "pending", "paid", "partially_paid", "refunded", "voided", "partially_refunded", "any"]).optional().describe("Filter by payment status"),
  fulfillment_status: z.enum(["shipped", "partial", "unshipped", "unfulfilled", "any"]).optional().describe("Filter by fulfillment status"),
  created_at_min: z.string().optional().describe("Filter orders created after this ISO 8601 date (e.g. 2024-01-01T00:00:00Z)"),
  created_at_max: z.string().optional().describe("Filter orders created before this ISO 8601 date"),
  customer_id: z.string().optional().describe("Filter orders by customer ID"),
  page_info: z.string().optional().describe("Cursor for next page (from previous response nextPageInfo)"),
});

const GetOrderSchema = z.object({
  order_id: z.string().describe("Shopify order ID"),
});

const CreateOrderSchema = z.object({
  line_items: z.array(z.object({
    variant_id: z.number().optional().describe("Variant ID"),
    product_id: z.number().optional().describe("Product ID (if no variant)"),
    title: z.string().optional().describe("Custom line item title"),
    price: z.string().optional().describe("Custom price"),
    quantity: z.number().describe("Quantity"),
    sku: z.string().optional(),
  })).describe("Line items for the order (required)"),
  customer: z.object({
    id: z.number().optional().describe("Existing customer ID"),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
  }).optional().describe("Customer info"),
  email: z.string().email().optional().describe("Customer email (shorthand)"),
  note: z.string().optional().describe("Order note"),
  tags: z.string().optional().describe("Comma-separated tags"),
  shipping_address: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    address1: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
  }).optional().describe("Shipping address"),
});

const CancelOrderSchema = z.object({
  order_id: z.string().describe("Shopify order ID to cancel"),
  reason: z.enum(["customer", "fraud", "inventory", "declined", "other"]).optional().default("other").describe("Cancellation reason"),
  email: z.boolean().optional().default(false).describe("Send cancellation email to customer"),
  restock: z.boolean().optional().default(true).describe("Restock inventory items"),
  note: z.string().optional().describe("Staff note about the cancellation"),
  refund: z.object({
    shipping: z.object({ full_refund: z.boolean().optional() }).optional(),
    refund_line_items: z.array(z.object({
      line_item_id: z.number(),
      quantity: z.number(),
      restock_type: z.enum(["no_restock", "cancel", "return", "legacy_restock"]).optional(),
    })).optional(),
  }).optional().describe("Optional refund to issue alongside cancellation"),
});

const CloseOrderSchema = z.object({
  order_id: z.string().describe("Shopify order ID to close"),
});

const GetOrderTransactionsSchema = z.object({
  order_id: z.string().describe("Shopify order ID"),
  transaction_id: z.string().optional().describe("Filter to a specific transaction ID"),
});

const UpdateOrderSchema = z.object({
  order_id: z.string().describe("Shopify order ID"),
  note: z.string().optional().describe("Updated order note"),
  tags: z.string().optional().describe("Updated comma-separated tags"),
  email: z.string().email().optional().describe("Updated customer email"),
  shipping_address: z.object({
    address1: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }).optional().describe("Updated shipping address"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_orders",
      title: "List Orders",
      description:
        "List Shopify orders with optional filters. Supports filtering by status, payment status, fulfillment status, date range, and customer. Returns order number, total, line items summary, and customer info. Supports cursor-based pagination via nextPageInfo. Use when browsing orders or finding orders matching criteria.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          status: { type: "string", enum: ["open", "closed", "cancelled", "any"], description: "Filter by order status" },
          financial_status: { type: "string", enum: ["authorized", "pending", "paid", "partially_paid", "refunded", "voided", "partially_refunded", "any"], description: "Filter by payment status" },
          fulfillment_status: { type: "string", enum: ["shipped", "partial", "unshipped", "unfulfilled", "any"], description: "Filter by fulfillment status" },
          created_at_min: { type: "string", description: "Filter orders created after ISO 8601 date (e.g. 2024-01-01T00:00:00Z)" },
          created_at_max: { type: "string", description: "Filter orders created before ISO 8601 date" },
          customer_id: { type: "string", description: "Filter orders by customer ID" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: {
              count: { type: "number" },
              hasMore: { type: "boolean" },
              nextPageInfo: { type: "string" },
            },
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
      name: "get_order",
      title: "Get Order",
      description:
        "Get full details for a Shopify order by ID. Returns line items with product/variant info, customer details, fulfillments, and payment status. Use when the user references a specific order ID or needs complete order details.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
        },
        required: ["order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          order_number: { type: "number" },
          financial_status: { type: "string" },
          fulfillment_status: { type: "string" },
          total_price: { type: "string" },
          line_items: { type: "array" },
          customer: { type: "object" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "create_order",
      title: "Create Draft Order",
      description:
        "Create a new draft order in Shopify with line items and optional customer info. Draft orders allow you to build orders on behalf of customers. Returns the created order with assigned ID.",
      inputSchema: {
        type: "object",
        properties: {
          line_items: {
            type: "array",
            description: "Line items (required)",
            items: {
              type: "object",
              properties: {
                variant_id: { type: "number" },
                product_id: { type: "number" },
                title: { type: "string" },
                price: { type: "string" },
                quantity: { type: "number" },
                sku: { type: "string" },
              },
              required: ["quantity"],
            },
          },
          email: { type: "string", description: "Customer email" },
          note: { type: "string", description: "Order note" },
          tags: { type: "string", description: "Comma-separated tags" },
          shipping_address: { type: "object", description: "Shipping address" },
        },
        required: ["line_items"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          order_number: { type: "number" },
          status: { type: "string" },
          total_price: { type: "string" },
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
    {
      name: "update_order",
      title: "Update Order",
      description:
        "Update an existing Shopify order's note, tags, email, or shipping address. Only include fields to change. Returns the updated order.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          note: { type: "string", description: "Updated order note" },
          tags: { type: "string", description: "Updated comma-separated tags" },
          email: { type: "string", description: "Updated customer email" },
          shipping_address: {
            type: "object",
            description: "Updated shipping address",
            properties: {
              address1: { type: "string" },
              city: { type: "string" },
              province: { type: "string" },
              country: { type: "string" },
              zip: { type: "string" },
              phone: { type: "string" },
              first_name: { type: "string" },
              last_name: { type: "string" },
            },
          },
        },
        required: ["order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          order_number: { type: "number" },
          updated_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "cancel_order",
      title: "Cancel Order",
      description:
        "Cancel a Shopify order. Optionally specify a reason, whether to restock items, and whether to send a cancellation email. Optionally include a refund. Returns the cancelled order.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          reason: { type: "string", enum: ["customer", "fraud", "inventory", "declined", "other"], description: "Cancellation reason" },
          email: { type: "boolean", description: "Send cancellation email to customer" },
          restock: { type: "boolean", description: "Restock inventory items (default: true)" },
          note: { type: "string", description: "Staff note" },
        },
        required: ["order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          cancelled_at: { type: "string" },
          cancel_reason: { type: "string" },
          financial_status: { type: "string" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "close_order",
      title: "Close Order",
      description:
        "Close a fulfilled Shopify order. Closing an order archives it and marks it as completed without cancelling it. Useful for manually closing orders that have been fulfilled outside Shopify. Returns the closed order.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID to close" },
        },
        required: ["order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          closed_at: { type: "string" },
          status: { type: "string" },
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
    {
      name: "get_order_transactions",
      title: "Get Order Transactions",
      description:
        "Get all payment transactions for a Shopify order. Returns authorization, capture, refund, and void transactions with amounts, gateway, status, and timestamps. Use when reviewing payment history for an order.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          transaction_id: { type: "string", description: "Optional: filter to a specific transaction" },
        },
        required: ["order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" } } },
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
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_orders: async (args) => {
      const params = ListOrdersSchema.parse(args);

      let result: { data: ShopifyOrder[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_orders", () =>
          client.paginateFromCursor<ShopifyOrder>("/orders.json", params.page_info!, params.limit)
        , { tool: "list_orders" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.status) extraParams.status = params.status;
        if (params.financial_status) extraParams.financial_status = params.financial_status;
        if (params.fulfillment_status) extraParams.fulfillment_status = params.fulfillment_status;
        if (params.created_at_min) extraParams.created_at_min = params.created_at_min;
        if (params.created_at_max) extraParams.created_at_max = params.created_at_max;
        if (params.customer_id) extraParams.customer_id = params.customer_id;

        result = await logger.time("tool.list_orders", () =>
          client.paginatedGet<ShopifyOrder>("/orders.json", extraParams, params.limit)
        , { tool: "list_orders" });
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

    get_order: async (args) => {
      const { order_id } = GetOrderSchema.parse(args);
      const data = await logger.time("tool.get_order", () =>
        client.get<{ order: ShopifyOrder }>(`/orders/${order_id}.json`)
      , { tool: "get_order", order_id });

      const order = (data as { order: ShopifyOrder }).order;

      return {
        content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
        structuredContent: order,
      };
    },

    create_order: async (args) => {
      const params = CreateOrderSchema.parse(args);
      // Use draft_orders endpoint to create orders manually
      const data = await logger.time("tool.create_order", () =>
        client.post<{ draft_order: ShopifyOrder }>("/draft_orders.json", { draft_order: params })
      , { tool: "create_order" });

      const order = (data as { draft_order: ShopifyOrder }).draft_order;

      return {
        content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
        structuredContent: order,
      };
    },

    update_order: async (args) => {
      const { order_id, ...updateData } = UpdateOrderSchema.parse(args);
      const data = await logger.time("tool.update_order", () =>
        client.put<{ order: ShopifyOrder }>(`/orders/${order_id}.json`, { order: updateData })
      , { tool: "update_order", order_id });

      const order = (data as { order: ShopifyOrder }).order;

      return {
        content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
        structuredContent: order,
      };
    },

    cancel_order: async (args) => {
      const { order_id, ...params } = CancelOrderSchema.parse(args);
      const body: Record<string, unknown> = {};
      if (params.reason) body.reason = params.reason;
      if (params.email !== undefined) body.email = params.email;
      if (params.restock !== undefined) body.restock = params.restock;
      if (params.note) body.note = params.note;
      if (params.refund) body.refund = params.refund;

      const data = await logger.time("tool.cancel_order", () =>
        client.post<{ order: ShopifyOrder }>(`/orders/${order_id}/cancel.json`, body)
      , { tool: "cancel_order", order_id });

      const order = (data as { order: ShopifyOrder }).order;

      return {
        content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
        structuredContent: order,
      };
    },

    close_order: async (args) => {
      const { order_id } = CloseOrderSchema.parse(args);
      const data = await logger.time("tool.close_order", () =>
        client.post<{ order: ShopifyOrder }>(`/orders/${order_id}/close.json`, {})
      , { tool: "close_order", order_id });

      const order = (data as { order: ShopifyOrder }).order;

      return {
        content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
        structuredContent: order,
      };
    },

    get_order_transactions: async (args) => {
      const { order_id, transaction_id } = GetOrderTransactionsSchema.parse(args);
      let endpoint = `/orders/${order_id}/transactions.json`;
      if (transaction_id) {
        endpoint = `/orders/${order_id}/transactions/${transaction_id}.json`;
        const data = await logger.time("tool.get_order_transactions", () =>
          client.get<{ transaction: unknown }>(endpoint)
        , { tool: "get_order_transactions", order_id });
        const tx = (data as { transaction: unknown }).transaction;
        const response = { data: [tx], meta: { count: 1 } };
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
          structuredContent: response,
        };
      }

      const data = await logger.time("tool.get_order_transactions", () =>
        client.get<{ transactions: unknown[] }>(endpoint)
      , { tool: "get_order_transactions", order_id });
      const transactions = (data as { transactions: unknown[] }).transactions || [];
      const response = { data: transactions, meta: { count: transactions.length } };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
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
