// Assigned Fulfillment Orders tools — Shopify Admin API 2024-01
// Covers: list_assigned_fulfillment_orders, accept_fulfillment_request, reject_fulfillment_request, accept_cancellation_request, reject_cancellation_request

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyFulfillmentOrder {
  id?: number;
  order_id?: number;
  assigned_location_id?: number;
  request_status?: string;
  status?: string;
  supported_actions?: string[];
  fulfill_at?: string | null;
  destination?: Record<string, unknown>;
  line_items?: unknown[];
  delivery_method?: Record<string, unknown>;
}

const ListAssignedFulfillmentOrdersSchema = z.object({
  assignment_status: z.enum([
    "CANCELLATION_REQUESTED", "FULFILLMENT_REQUESTED", "FULFILLMENT_ACCEPTED",
  ]).optional().describe("Filter by assignment status"),
  location_ids: z.string().optional().describe("Comma-separated location IDs to filter by"),
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
});

const AcceptFulfillmentRequestSchema = z.object({
  fulfillment_order_id: z.string().describe("Fulfillment order ID to accept"),
  message: z.string().optional().describe("Optional message to merchant"),
});

const RejectFulfillmentRequestSchema = z.object({
  fulfillment_order_id: z.string().describe("Fulfillment order ID to reject"),
  reason: z.enum([
    "INVENTORY_OUT_OF_STOCK", "INELIGIBLE_PRODUCT", "UNDELIVERABLE_DESTINATION",
    "NO_CAPACITY_FOR_SPECIFIC_QUANTITY_AVAILABLE", "OTHER",
  ]).optional().describe("Rejection reason"),
  message: z.string().optional().describe("Rejection message"),
  line_items: z.array(z.object({
    fulfillment_order_line_item_id: z.number().describe("Line item ID"),
    quantity: z.number().describe("Rejected quantity"),
  })).optional().describe("Specific line items to reject (partial rejection)"),
});

const AcceptCancellationRequestSchema = z.object({
  fulfillment_order_id: z.string().describe("Fulfillment order ID"),
  message: z.string().optional().describe("Optional message"),
});

const RejectCancellationRequestSchema = z.object({
  fulfillment_order_id: z.string().describe("Fulfillment order ID"),
  message: z.string().optional().describe("Rejection message"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_assigned_fulfillment_orders",
      title: "List Assigned Fulfillment Orders",
      description: "List fulfillment orders assigned to the fulfillment service (app). Filter by assignment status: FULFILLMENT_REQUESTED (new requests), CANCELLATION_REQUESTED, or FULFILLMENT_ACCEPTED. Used by fulfillment service apps to process orders.",
      inputSchema: {
        type: "object",
        properties: {
          assignment_status: {
            type: "string",
            enum: ["CANCELLATION_REQUESTED", "FULFILLMENT_REQUESTED", "FULFILLMENT_ACCEPTED"],
            description: "Filter by status",
          },
          location_ids: { type: "string", description: "Comma-separated location IDs" },
          limit: { type: "number", description: "Number of results" },
          page_info: { type: "string", description: "Pagination cursor" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "accept_fulfillment_request",
      title: "Accept Fulfillment Request",
      description: "Accept a fulfillment request from a merchant. Changes the fulfillment order status to FULFILLMENT_ACCEPTED. Used by fulfillment service apps to confirm they'll fulfill the order.",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment_order_id: { type: "string", description: "Fulfillment order ID" },
          message: { type: "string", description: "Optional acceptance message" },
        },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "reject_fulfillment_request",
      title: "Reject Fulfillment Request",
      description: "Reject a fulfillment request. Specify reason and optionally reject only specific line items/quantities. The merchant will need to reassign fulfillment.",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment_order_id: { type: "string", description: "Fulfillment order ID" },
          reason: { type: "string", enum: ["INVENTORY_OUT_OF_STOCK", "INELIGIBLE_PRODUCT", "UNDELIVERABLE_DESTINATION", "NO_CAPACITY_FOR_SPECIFIC_QUANTITY_AVAILABLE", "OTHER"], description: "Rejection reason" },
          message: { type: "string", description: "Rejection message" },
          line_items: { type: "array", description: "Specific line items to reject" },
        },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "accept_cancellation_request",
      title: "Accept Cancellation Request",
      description: "Accept a merchant's request to cancel a fulfillment order. Moves the fulfillment order back to the merchant for reassignment.",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment_order_id: { type: "string", description: "Fulfillment order ID" },
          message: { type: "string", description: "Optional message" },
        },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "reject_cancellation_request",
      title: "Reject Cancellation Request",
      description: "Reject a merchant's cancellation request. The fulfillment order will remain with the fulfillment service.",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment_order_id: { type: "string", description: "Fulfillment order ID" },
          message: { type: "string", description: "Rejection message" },
        },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_assigned_fulfillment_orders: async (args) => {
      const params = ListAssignedFulfillmentOrdersSchema.parse(args);
      const qs = new URLSearchParams({ limit: String(params.limit) });
      if (params.assignment_status) qs.set("assignment_status", params.assignment_status);
      if (params.location_ids) qs.set("location_ids", params.location_ids);
      if (params.page_info) qs.set("page_info", params.page_info);
      const data = await logger.time("tool.list_assigned_fulfillment_orders", () =>
        client.get<{ fulfillment_orders: ShopifyFulfillmentOrder[] }>(`/assigned_fulfillment_orders.json?${qs}`)
      , { tool: "list_assigned_fulfillment_orders" });
      const orders = (data as { fulfillment_orders: ShopifyFulfillmentOrder[] }).fulfillment_orders;
      const response = { data: orders, meta: { count: orders.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    accept_fulfillment_request: async (args) => {
      const { fulfillment_order_id, message } = AcceptFulfillmentRequestSchema.parse(args);
      const data = await logger.time("tool.accept_fulfillment_request", () =>
        client.post<Record<string, unknown>>(
          `/fulfillment_orders/${fulfillment_order_id}/fulfillment_request/accept.json`,
          { fulfillment_request: { message } }
        )
      , { tool: "accept_fulfillment_request" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    reject_fulfillment_request: async (args) => {
      const { fulfillment_order_id, ...body } = RejectFulfillmentRequestSchema.parse(args);
      const data = await logger.time("tool.reject_fulfillment_request", () =>
        client.post<Record<string, unknown>>(
          `/fulfillment_orders/${fulfillment_order_id}/fulfillment_request/reject.json`,
          { fulfillment_request: body }
        )
      , { tool: "reject_fulfillment_request" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    accept_cancellation_request: async (args) => {
      const { fulfillment_order_id, message } = AcceptCancellationRequestSchema.parse(args);
      const data = await logger.time("tool.accept_cancellation_request", () =>
        client.post<Record<string, unknown>>(
          `/fulfillment_orders/${fulfillment_order_id}/cancellation_request/accept.json`,
          { cancellation_request: { message } }
        )
      , { tool: "accept_cancellation_request" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    reject_cancellation_request: async (args) => {
      const { fulfillment_order_id, message } = RejectCancellationRequestSchema.parse(args);
      const data = await logger.time("tool.reject_cancellation_request", () =>
        client.post<Record<string, unknown>>(
          `/fulfillment_orders/${fulfillment_order_id}/cancellation_request/reject.json`,
          { cancellation_request: { message } }
        )
      , { tool: "reject_cancellation_request" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
