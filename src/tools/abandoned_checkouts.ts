// Abandoned Checkouts tools — Shopify Admin API 2024-01
// Covers: list_abandoned_checkouts, get_abandoned_checkout

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyAbandonedCheckout {
  id?: number;
  token?: string;
  cart_token?: string;
  email?: string;
  phone?: string | null;
  gateway?: string | null;
  buyer_accepts_marketing?: boolean;
  created_at?: string;
  updated_at?: string;
  landing_site?: string | null;
  note?: string | null;
  referring_site?: string | null;
  shipping_lines?: unknown[];
  taxes_included?: boolean;
  total_weight?: number;
  currency?: string;
  completed_at?: string | null;
  closed_at?: string | null;
  source_identifier?: string | null;
  source_url?: string | null;
  source_name?: string;
  presentment_currency?: string;
  billing_address?: Record<string, unknown> | null;
  shipping_address?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  line_items?: unknown[];
  subtotal_price?: string;
  total_tax?: string;
  total_price?: string;
  discount_codes?: unknown[];
  abandoned_checkout_url?: string;
}

// === Zod Schemas ===
const ListAbandonedCheckoutsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
  created_at_min: z.string().optional().describe("Filter checkouts created after ISO 8601 date"),
  created_at_max: z.string().optional().describe("Filter checkouts created before ISO 8601 date"),
  updated_at_min: z.string().optional().describe("Filter checkouts updated after ISO 8601 date"),
  updated_at_max: z.string().optional().describe("Filter checkouts updated before ISO 8601 date"),
  status: z.enum(["open", "closed"]).optional().describe("Filter by checkout status: open (still recoverable) or closed"),
  since_id: z.string().optional().describe("Return checkouts after this ID"),
});

const GetAbandonedCheckoutSchema = z.object({
  checkout_id: z.string().describe("Shopify abandoned checkout ID"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_abandoned_checkouts",
      title: "List Abandoned Checkouts",
      description:
        "List abandoned checkouts on the Shopify store. Abandoned checkouts are carts that customers started but did not complete. Returns customer email, line items, total price, and the recovery URL. Supports filtering by date range and status. Use for cart recovery campaigns or analytics.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          created_at_min: { type: "string", description: "Filter created after ISO 8601 date" },
          created_at_max: { type: "string", description: "Filter created before ISO 8601 date" },
          updated_at_min: { type: "string", description: "Filter updated after ISO 8601 date" },
          updated_at_max: { type: "string", description: "Filter updated before ISO 8601 date" },
          status: { type: "string", enum: ["open", "closed"], description: "Filter by status: open or closed" },
          since_id: { type: "string", description: "Return checkouts with ID greater than this" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" }, hasMore: { type: "boolean" }, nextPageInfo: { type: "string" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_abandoned_checkout",
      title: "Get Abandoned Checkout",
      description:
        "Get full details for a specific abandoned checkout by ID. Returns customer info, all line items with prices, shipping address, applied discounts, and the abandoned_checkout_url that can be sent to the customer to recover the cart.",
      inputSchema: {
        type: "object",
        properties: {
          checkout_id: { type: "string", description: "Shopify abandoned checkout ID" },
        },
        required: ["checkout_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          email: { type: "string" },
          abandoned_checkout_url: { type: "string" },
          total_price: { type: "string" },
          line_items: { type: "array" },
          customer: { type: "object" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_abandoned_checkouts: async (args) => {
      const params = ListAbandonedCheckoutsSchema.parse(args);
      let result: { data: ShopifyAbandonedCheckout[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_abandoned_checkouts", () =>
          client.paginateFromCursor<ShopifyAbandonedCheckout>("/checkouts.json", params.page_info!, params.limit)
        , { tool: "list_abandoned_checkouts" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.created_at_min) extraParams.created_at_min = params.created_at_min;
        if (params.created_at_max) extraParams.created_at_max = params.created_at_max;
        if (params.updated_at_min) extraParams.updated_at_min = params.updated_at_min;
        if (params.updated_at_max) extraParams.updated_at_max = params.updated_at_max;
        if (params.status) extraParams.status = params.status;
        if (params.since_id) extraParams.since_id = params.since_id;

        result = await logger.time("tool.list_abandoned_checkouts", () =>
          client.paginatedGet<ShopifyAbandonedCheckout>("/checkouts.json", extraParams, params.limit)
        , { tool: "list_abandoned_checkouts" });
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

    get_abandoned_checkout: async (args) => {
      const { checkout_id } = GetAbandonedCheckoutSchema.parse(args);
      const data = await logger.time("tool.get_abandoned_checkout", () =>
        client.get<{ checkout: ShopifyAbandonedCheckout }>(`/checkouts/${checkout_id}.json`)
      , { tool: "get_abandoned_checkout", checkout_id });

      const checkout = (data as { checkout: ShopifyAbandonedCheckout }).checkout;

      return {
        content: [{ type: "text", text: JSON.stringify(checkout, null, 2) }],
        structuredContent: checkout,
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
