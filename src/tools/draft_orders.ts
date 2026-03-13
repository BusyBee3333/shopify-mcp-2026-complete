// Draft Orders tools — Shopify Admin API 2024-01
// Covers: list_draft_orders, create_draft_order, complete_draft_order, delete_draft_order

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyDraftOrder {
  id: number;
  name?: string;
  status?: string;
  email?: string;
  total_price?: string;
  subtotal_price?: string;
  total_tax?: string;
  line_items?: unknown[];
  customer?: unknown;
  note?: string | null;
  tags?: string;
  invoice_url?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  order_id?: number | null;
}

// === Zod Schemas ===
const ListDraftOrdersSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  status: z.enum(["open", "invoice_sent", "completed"]).optional().describe("Filter by draft order status"),
  page_info: z.string().optional().describe("Cursor for next page (from previous response nextPageInfo)"),
});

const CreateDraftOrderSchema = z.object({
  line_items: z.array(z.object({
    variant_id: z.number().optional().describe("Product variant ID"),
    product_id: z.number().optional().describe("Product ID"),
    title: z.string().optional().describe("Custom item title"),
    price: z.string().optional().describe("Custom price"),
    quantity: z.number().describe("Quantity"),
    sku: z.string().optional().describe("SKU"),
    requires_shipping: z.boolean().optional(),
    taxable: z.boolean().optional(),
  })).describe("Line items for the draft order"),
  email: z.string().email().optional().describe("Customer email"),
  customer: z.object({
    id: z.number().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
  }).optional().describe("Customer info"),
  billing_address: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    address1: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
  }).optional().describe("Billing address"),
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
  note: z.string().optional().describe("Internal note"),
  tags: z.string().optional().describe("Comma-separated tags"),
  discount: z.object({
    value_type: z.enum(["fixed_amount", "percentage"]).describe("Discount type"),
    value: z.string().describe("Discount value"),
    title: z.string().optional().describe("Discount title"),
    description: z.string().optional().describe("Discount description"),
  }).optional().describe("Applied discount"),
  use_customer_default_address: z.boolean().optional().describe("Use customer's default address"),
});

const CompleteDraftOrderSchema = z.object({
  draft_order_id: z.string().describe("Draft order ID to complete"),
  payment_pending: z.boolean().optional().default(false).describe("Mark as payment pending (true) or payment accepted (false)"),
});

const DeleteDraftOrderSchema = z.object({
  draft_order_id: z.string().describe("Draft order ID to delete"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_draft_orders",
      title: "List Draft Orders",
      description:
        "List Shopify draft orders with optional status filter. Draft orders are orders created manually or via API before payment. Returns order name, status, total, customer, and invoice URL. Supports cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          status: { type: "string", enum: ["open", "invoice_sent", "completed"], description: "Filter by status" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: { count: { type: "number" }, hasMore: { type: "boolean" }, nextPageInfo: { type: "string" } },
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
      name: "create_draft_order",
      title: "Create Draft Order",
      description:
        "Create a new Shopify draft order. Draft orders allow you to build orders on behalf of customers, apply discounts, and send invoices. Returns the created draft order with invoice URL.",
      inputSchema: {
        type: "object",
        properties: {
          line_items: {
            type: "array",
            description: "Line items",
            items: {
              type: "object",
              properties: {
                variant_id: { type: "number" },
                title: { type: "string" },
                price: { type: "string" },
                quantity: { type: "number" },
                sku: { type: "string" },
              },
              required: ["quantity"],
            },
          },
          email: { type: "string", description: "Customer email" },
          note: { type: "string", description: "Internal note" },
          tags: { type: "string", description: "Comma-separated tags" },
          discount: {
            type: "object",
            description: "Applied discount",
            properties: {
              value_type: { type: "string", enum: ["fixed_amount", "percentage"] },
              value: { type: "string" },
              title: { type: "string" },
            },
          },
          shipping_address: { type: "object", description: "Shipping address" },
        },
        required: ["line_items"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          name: { type: "string" },
          status: { type: "string" },
          total_price: { type: "string" },
          invoice_url: { type: "string" },
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
      name: "complete_draft_order",
      title: "Complete Draft Order",
      description:
        "Complete a Shopify draft order, converting it into a full order. Use payment_pending=true if payment hasn't been received yet, or false if payment is already confirmed. Returns the completed order.",
      inputSchema: {
        type: "object",
        properties: {
          draft_order_id: { type: "string", description: "Draft order ID to complete" },
          payment_pending: { type: "boolean", description: "True if payment is pending, false if paid" },
        },
        required: ["draft_order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          name: { type: "string" },
          status: { type: "string" },
          order_id: { type: "number" },
          completed_at: { type: "string" },
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
      name: "delete_draft_order",
      title: "Delete Draft Order",
      description:
        "Permanently delete a Shopify draft order. Only draft orders with status 'open' or 'invoice_sent' can be deleted (not completed ones). This cannot be undone.",
      inputSchema: {
        type: "object",
        properties: {
          draft_order_id: { type: "string", description: "Draft order ID to delete" },
        },
        required: ["draft_order_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          draft_order_id: { type: "string" },
        },
        required: ["success"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_draft_orders: async (args) => {
      const params = ListDraftOrdersSchema.parse(args);
      let result: { data: ShopifyDraftOrder[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_draft_orders", () =>
          client.paginateFromCursor<ShopifyDraftOrder>("/draft_orders.json", params.page_info!, params.limit)
        , { tool: "list_draft_orders" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.status) extraParams.status = params.status;

        result = await logger.time("tool.list_draft_orders", () =>
          client.paginatedGet<ShopifyDraftOrder>("/draft_orders.json", extraParams, params.limit)
        , { tool: "list_draft_orders" });
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

    create_draft_order: async (args) => {
      const params = CreateDraftOrderSchema.parse(args);
      const data = await logger.time("tool.create_draft_order", () =>
        client.post<{ draft_order: ShopifyDraftOrder }>("/draft_orders.json", { draft_order: params })
      , { tool: "create_draft_order" });

      const draftOrder = (data as { draft_order: ShopifyDraftOrder }).draft_order;

      return {
        content: [{ type: "text", text: JSON.stringify(draftOrder, null, 2) }],
        structuredContent: draftOrder,
      };
    },

    complete_draft_order: async (args) => {
      const { draft_order_id, payment_pending } = CompleteDraftOrderSchema.parse(args);
      const data = await logger.time("tool.complete_draft_order", () =>
        client.post<{ draft_order: ShopifyDraftOrder }>(
          `/draft_orders/${draft_order_id}/complete.json?payment_pending=${payment_pending ?? false}`,
          {}
        )
      , { tool: "complete_draft_order", draft_order_id });

      const draftOrder = (data as { draft_order: ShopifyDraftOrder }).draft_order;

      return {
        content: [{ type: "text", text: JSON.stringify(draftOrder, null, 2) }],
        structuredContent: draftOrder,
      };
    },

    delete_draft_order: async (args) => {
      const { draft_order_id } = DeleteDraftOrderSchema.parse(args);
      await logger.time("tool.delete_draft_order", () =>
        client.delete<unknown>(`/draft_orders/${draft_order_id}.json`)
      , { tool: "delete_draft_order", draft_order_id });

      const response = { success: true, draft_order_id };

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
