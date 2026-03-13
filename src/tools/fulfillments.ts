// Fulfillments tools — Shopify Admin API 2024-01
// Covers: list_fulfillments, create_fulfillment, get_fulfillment, cancel_fulfillment

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyFulfillment {
  id: number;
  order_id: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
  tracking_number?: string | null;
  tracking_numbers?: string[];
  tracking_url?: string | null;
  tracking_urls?: string[];
  tracking_company?: string | null;
  line_items?: unknown[];
  notify_customer?: boolean;
  location_id?: number | null;
}

// === Zod Schemas ===
const ListFulfillmentsSchema = z.object({
  order_id: z.string().describe("Shopify order ID to list fulfillments for"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page (from previous response nextPageInfo)"),
});

const GetFulfillmentSchema = z.object({
  order_id: z.string().describe("Shopify order ID"),
  fulfillment_id: z.string().describe("Shopify fulfillment ID"),
});

const CreateFulfillmentSchema = z.object({
  order_id: z.string().describe("Shopify order ID to fulfill"),
  location_id: z.number().optional().describe("Location ID to fulfill from"),
  tracking_number: z.string().optional().describe("Tracking number for the shipment"),
  tracking_company: z.string().optional().describe("Shipping carrier name (e.g. USPS, FedEx, UPS)"),
  tracking_url: z.string().optional().describe("Full tracking URL"),
  notify_customer: z.boolean().optional().default(false).describe("Send shipping notification email to customer"),
  line_items: z.array(z.object({
    id: z.number().describe("Line item ID"),
    quantity: z.number().describe("Quantity to fulfill"),
  })).optional().describe("Specific line items to fulfill (omit to fulfill all)"),
});

const CancelFulfillmentSchema = z.object({
  order_id: z.string().describe("Shopify order ID"),
  fulfillment_id: z.string().describe("Shopify fulfillment ID to cancel"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_fulfillments",
      title: "List Fulfillments",
      description:
        "List all fulfillments for a specific Shopify order. Returns fulfillment status, tracking numbers, tracking URLs, and line items. Supports cursor-based pagination. Use when checking shipping status or tracking info for an order.",
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
      name: "get_fulfillment",
      title: "Get Fulfillment",
      description:
        "Get full details for a specific fulfillment by order ID and fulfillment ID. Returns tracking info, status, and line items. Use when the user needs details on a specific fulfillment.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          fulfillment_id: { type: "string", description: "Shopify fulfillment ID" },
        },
        required: ["order_id", "fulfillment_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          order_id: { type: "number" },
          status: { type: "string" },
          tracking_number: { type: "string" },
          tracking_company: { type: "string" },
          created_at: { type: "string" },
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
      name: "create_fulfillment",
      title: "Create Fulfillment",
      description:
        "Create a new fulfillment for a Shopify order. Optionally specify tracking info, location, and specific line items to partially fulfill. Use when marking items as shipped.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          location_id: { type: "number", description: "Location ID to fulfill from" },
          tracking_number: { type: "string", description: "Tracking number" },
          tracking_company: { type: "string", description: "Carrier name (USPS, FedEx, UPS, etc.)" },
          tracking_url: { type: "string", description: "Full tracking URL" },
          notify_customer: { type: "boolean", description: "Send shipping notification to customer" },
          line_items: {
            type: "array",
            description: "Specific line items to fulfill",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                quantity: { type: "number" },
              },
              required: ["id", "quantity"],
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
          status: { type: "string" },
          tracking_number: { type: "string" },
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
      name: "cancel_fulfillment",
      title: "Cancel Fulfillment",
      description:
        "Cancel an existing fulfillment for a Shopify order. Returns the cancelled fulfillment. Use when a shipment needs to be voided before it leaves.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          fulfillment_id: { type: "string", description: "Shopify fulfillment ID to cancel" },
        },
        required: ["order_id", "fulfillment_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          order_id: { type: "number" },
          status: { type: "string" },
          updated_at: { type: "string" },
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
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_fulfillments: async (args) => {
      const params = ListFulfillmentsSchema.parse(args);
      let result: { data: ShopifyFulfillment[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_fulfillments", () =>
          client.paginateFromCursor<ShopifyFulfillment>(
            `/orders/${params.order_id}/fulfillments.json`,
            params.page_info!,
            params.limit
          )
        , { tool: "list_fulfillments" });
      } else {
        result = await logger.time("tool.list_fulfillments", () =>
          client.paginatedGet<ShopifyFulfillment>(
            `/orders/${params.order_id}/fulfillments.json`,
            {},
            params.limit
          )
        , { tool: "list_fulfillments" });
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

    get_fulfillment: async (args) => {
      const { order_id, fulfillment_id } = GetFulfillmentSchema.parse(args);
      const data = await logger.time("tool.get_fulfillment", () =>
        client.get<{ fulfillment: ShopifyFulfillment }>(
          `/orders/${order_id}/fulfillments/${fulfillment_id}.json`
        )
      , { tool: "get_fulfillment", order_id, fulfillment_id });

      const fulfillment = (data as { fulfillment: ShopifyFulfillment }).fulfillment;

      return {
        content: [{ type: "text", text: JSON.stringify(fulfillment, null, 2) }],
        structuredContent: fulfillment,
      };
    },

    create_fulfillment: async (args) => {
      const { order_id, ...params } = CreateFulfillmentSchema.parse(args);
      const body: Record<string, unknown> = {};
      if (params.location_id !== undefined) body.location_id = params.location_id;
      if (params.tracking_number) body.tracking_number = params.tracking_number;
      if (params.tracking_company) body.tracking_company = params.tracking_company;
      if (params.tracking_url) body.tracking_url = params.tracking_url;
      if (params.notify_customer !== undefined) body.notify_customer = params.notify_customer;
      if (params.line_items) body.line_items = params.line_items;

      const data = await logger.time("tool.create_fulfillment", () =>
        client.post<{ fulfillment: ShopifyFulfillment }>(
          `/orders/${order_id}/fulfillments.json`,
          { fulfillment: body }
        )
      , { tool: "create_fulfillment", order_id });

      const fulfillment = (data as { fulfillment: ShopifyFulfillment }).fulfillment;

      return {
        content: [{ type: "text", text: JSON.stringify(fulfillment, null, 2) }],
        structuredContent: fulfillment,
      };
    },

    cancel_fulfillment: async (args) => {
      const { order_id, fulfillment_id } = CancelFulfillmentSchema.parse(args);
      const data = await logger.time("tool.cancel_fulfillment", () =>
        client.post<{ fulfillment: ShopifyFulfillment }>(
          `/orders/${order_id}/fulfillments/${fulfillment_id}/cancel.json`,
          {}
        )
      , { tool: "cancel_fulfillment", order_id, fulfillment_id });

      const fulfillment = (data as { fulfillment: ShopifyFulfillment }).fulfillment;

      return {
        content: [{ type: "text", text: JSON.stringify(fulfillment, null, 2) }],
        structuredContent: fulfillment,
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
