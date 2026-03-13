// Fulfillment Orders tools — Shopify Admin API 2024-01
// Covers: list_fulfillment_orders, get_fulfillment_order, move_fulfillment_order,
//         cancel_fulfillment_order, close_fulfillment_order, hold_fulfillment_order,
//         release_fulfillment_order_hold, list_fulfillment_order_locations

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyFulfillmentOrder {
  id: number;
  order_id: number;
  assigned_location_id?: number;
  delivery_method?: { method_type?: string };
  destination?: Record<string, unknown>;
  line_items?: unknown[];
  fulfill_at?: string | null;
  fulfill_by?: string | null;
  international_duties?: Record<string, unknown> | null;
  fulfillment_holds?: unknown[];
  created_at?: string;
  updated_at?: string;
  request_status?: string;
  status?: string;
  supported_actions?: string[];
}

// === Zod Schemas ===
const ListFulfillmentOrdersSchema = z.object({
  order_id: z.string().describe("Order ID"),
});

const GetFulfillmentOrderSchema = z.object({
  fulfillment_order_id: z.string(),
});

const MoveFulfillmentOrderSchema = z.object({
  fulfillment_order_id: z.string(),
  new_location_id: z.number().describe("Location ID to move fulfillment to"),
});

const CancelFulfillmentOrderSchema = z.object({
  fulfillment_order_id: z.string(),
});

const CloseFulfillmentOrderSchema = z.object({
  fulfillment_order_id: z.string(),
  message: z.string().optional().describe("Reason for closing"),
});

const HoldFulfillmentOrderSchema = z.object({
  fulfillment_order_id: z.string(),
  reason: z.enum(["awaiting_payment", "high_risk_of_fraud", "incorrect_address", "inventory_out_of_stock", "other"]),
  reason_notes: z.string().optional(),
  notify_merchant: z.boolean().optional(),
});

const ReleaseHoldSchema = z.object({
  fulfillment_order_id: z.string(),
});

const ListLocationsForFulfillmentSchema = z.object({
  fulfillment_order_id: z.string(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_fulfillment_orders",
      title: "List Fulfillment Orders",
      description: "List all fulfillment orders for an order. Fulfillment orders represent line items that need to be fulfilled, grouped by location and delivery method.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_fulfillment_order",
      title: "Get Fulfillment Order",
      description: "Get a specific fulfillment order by ID, including its status, line items, and supported actions.",
      inputSchema: {
        type: "object",
        properties: { fulfillment_order_id: { type: "string" } },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "move_fulfillment_order",
      title: "Move Fulfillment Order",
      description: "Move a fulfillment order to a different location. Returns the original and new fulfillment orders.",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment_order_id: { type: "string" },
          new_location_id: { type: "number" },
        },
        required: ["fulfillment_order_id", "new_location_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "cancel_fulfillment_order",
      title: "Cancel Fulfillment Order",
      description: "Cancel a fulfillment order. The fulfillment order is moved to CANCELLED status and the order is unfulfilled.",
      inputSchema: {
        type: "object",
        properties: { fulfillment_order_id: { type: "string" } },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "close_fulfillment_order",
      title: "Close Fulfillment Order",
      description: "Close a fulfillment order that cannot be completed. Provide a message explaining why.",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment_order_id: { type: "string" },
          message: { type: "string" },
        },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "hold_fulfillment_order",
      title: "Hold Fulfillment Order",
      description: "Place a fulfillment hold on a fulfillment order to prevent it from being fulfilled. Requires a reason.",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment_order_id: { type: "string" },
          reason: { type: "string", enum: ["awaiting_payment", "high_risk_of_fraud", "incorrect_address", "inventory_out_of_stock", "other"] },
          reason_notes: { type: "string" },
          notify_merchant: { type: "boolean" },
        },
        required: ["fulfillment_order_id", "reason"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "release_fulfillment_order_hold",
      title: "Release Fulfillment Order Hold",
      description: "Release a fulfillment hold so the order can proceed to fulfillment.",
      inputSchema: {
        type: "object",
        properties: { fulfillment_order_id: { type: "string" } },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "list_locations_for_fulfillment_order",
      title: "List Locations for Fulfillment Order",
      description: "List all locations that can fulfill a fulfillment order. Useful when deciding where to move a fulfillment.",
      inputSchema: {
        type: "object",
        properties: { fulfillment_order_id: { type: "string" } },
        required: ["fulfillment_order_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_fulfillment_orders: async (args) => {
      const { order_id } = ListFulfillmentOrdersSchema.parse(args);
      const data = await logger.time("tool.list_fulfillment_orders", () =>
        client.get<{ fulfillment_orders: ShopifyFulfillmentOrder[] }>(`/orders/${order_id}/fulfillment_orders.json`)
      , { tool: "list_fulfillment_orders" });
      const orders = (data as { fulfillment_orders: ShopifyFulfillmentOrder[] }).fulfillment_orders;
      const response = { data: orders, meta: { count: orders.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_fulfillment_order: async (args) => {
      const { fulfillment_order_id } = GetFulfillmentOrderSchema.parse(args);
      const data = await logger.time("tool.get_fulfillment_order", () =>
        client.get<{ fulfillment_order: ShopifyFulfillmentOrder }>(`/fulfillment_orders/${fulfillment_order_id}.json`)
      , { tool: "get_fulfillment_order" });
      const fo = (data as { fulfillment_order: ShopifyFulfillmentOrder }).fulfillment_order;
      return { content: [{ type: "text", text: JSON.stringify(fo, null, 2) }], structuredContent: fo };
    },

    move_fulfillment_order: async (args) => {
      const { fulfillment_order_id, new_location_id } = MoveFulfillmentOrderSchema.parse(args);
      const data = await logger.time("tool.move_fulfillment_order", () =>
        client.post<unknown>(`/fulfillment_orders/${fulfillment_order_id}/move.json`, { fulfillment_order: { new_location_id } })
      , { tool: "move_fulfillment_order" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    cancel_fulfillment_order: async (args) => {
      const { fulfillment_order_id } = CancelFulfillmentOrderSchema.parse(args);
      const data = await logger.time("tool.cancel_fulfillment_order", () =>
        client.post<{ fulfillment_order: ShopifyFulfillmentOrder }>(`/fulfillment_orders/${fulfillment_order_id}/cancel.json`, {})
      , { tool: "cancel_fulfillment_order" });
      const fo = (data as { fulfillment_order: ShopifyFulfillmentOrder }).fulfillment_order;
      return { content: [{ type: "text", text: JSON.stringify(fo, null, 2) }], structuredContent: fo };
    },

    close_fulfillment_order: async (args) => {
      const { fulfillment_order_id, message } = CloseFulfillmentOrderSchema.parse(args);
      const data = await logger.time("tool.close_fulfillment_order", () =>
        client.post<{ fulfillment_order: ShopifyFulfillmentOrder }>(`/fulfillment_orders/${fulfillment_order_id}/close.json`, { fulfillment_order: { message } })
      , { tool: "close_fulfillment_order" });
      const fo = (data as { fulfillment_order: ShopifyFulfillmentOrder }).fulfillment_order;
      return { content: [{ type: "text", text: JSON.stringify(fo, null, 2) }], structuredContent: fo };
    },

    hold_fulfillment_order: async (args) => {
      const { fulfillment_order_id, ...holdData } = HoldFulfillmentOrderSchema.parse(args);
      const data = await logger.time("tool.hold_fulfillment_order", () =>
        client.post<{ fulfillment_hold: unknown }>(`/fulfillment_orders/${fulfillment_order_id}/hold.json`, { fulfillment_hold: holdData })
      , { tool: "hold_fulfillment_order" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    release_fulfillment_order_hold: async (args) => {
      const { fulfillment_order_id } = ReleaseHoldSchema.parse(args);
      const data = await logger.time("tool.release_fulfillment_order_hold", () =>
        client.post<{ fulfillment_order: ShopifyFulfillmentOrder }>(`/fulfillment_orders/${fulfillment_order_id}/release_hold.json`, {})
      , { tool: "release_fulfillment_order_hold" });
      const fo = (data as { fulfillment_order: ShopifyFulfillmentOrder }).fulfillment_order;
      return { content: [{ type: "text", text: JSON.stringify(fo, null, 2) }], structuredContent: fo };
    },

    list_locations_for_fulfillment_order: async (args) => {
      const { fulfillment_order_id } = ListLocationsForFulfillmentSchema.parse(args);
      const data = await logger.time("tool.list_locations_for_fulfillment_order", () =>
        client.get<{ locations_for_move: unknown[] }>(`/fulfillment_orders/${fulfillment_order_id}/locations_for_move.json`)
      , { tool: "list_locations_for_fulfillment_order" });
      const locations = (data as { locations_for_move: unknown[] }).locations_for_move;
      const response = { data: locations, meta: { count: locations.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
