// Inventory Levels tools — Shopify Admin API 2024-01
// Covers: list_inventory_levels, set_inventory_level, adjust_inventory_level, connect_inventory_level, delete_inventory_level

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyInventoryLevel {
  inventory_item_id?: number;
  location_id?: number;
  available?: number | null;
  updated_at?: string;
  admin_graphql_api_id?: string;
}

const ListInventoryLevelsSchema = z.object({
  inventory_item_ids: z.string().optional().describe("Comma-separated inventory item IDs to filter by (max 50)"),
  location_ids: z.string().optional().describe("Comma-separated location IDs to filter by"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250)"),
  page_info: z.string().optional().describe("Cursor for next page"),
  updated_at_min: z.string().optional().describe("Filter by minimum updated date (ISO 8601)"),
});

const SetInventoryLevelSchema = z.object({
  location_id: z.number().describe("Location ID where inventory is held"),
  inventory_item_id: z.number().describe("Inventory item ID to set level for"),
  available: z.number().describe("Absolute inventory quantity to set"),
  disconnect_if_necessary: z.boolean().optional().default(false).describe("If true, disconnect from other locations if needed"),
});

const AdjustInventoryLevelSchema = z.object({
  location_id: z.number().describe("Location ID"),
  inventory_item_id: z.number().describe("Inventory item ID"),
  available_adjustment: z.number().describe("Amount to adjust (positive to add, negative to subtract)"),
});

const ConnectInventoryLevelSchema = z.object({
  location_id: z.number().describe("Location ID to connect to"),
  inventory_item_id: z.number().describe("Inventory item ID to connect"),
  relocate_if_necessary: z.boolean().optional().default(false).describe("Relocate from other locations if at capacity"),
});

const DeleteInventoryLevelSchema = z.object({
  location_id: z.number().describe("Location ID"),
  inventory_item_id: z.number().describe("Inventory item ID"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_inventory_levels",
      title: "List Inventory Levels",
      description: "List inventory levels across locations. Filter by inventory item IDs or location IDs. Returns available quantity at each location. Use to check stock levels across all fulfillment centers.",
      inputSchema: {
        type: "object",
        properties: {
          inventory_item_ids: { type: "string", description: "Comma-separated inventory item IDs (max 50)" },
          location_ids: { type: "string", description: "Comma-separated location IDs" },
          limit: { type: "number", description: "Number of results (1-250)" },
          page_info: { type: "string", description: "Pagination cursor" },
          updated_at_min: { type: "string", description: "Filter by minimum update date" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "set_inventory_level",
      title: "Set Inventory Level",
      description: "Set the absolute inventory quantity for an item at a specific location. Overwrites the current quantity. Use when you know the exact stock count (e.g. after a physical count).",
      inputSchema: {
        type: "object",
        properties: {
          location_id: { type: "number", description: "Location ID" },
          inventory_item_id: { type: "number", description: "Inventory item ID" },
          available: { type: "number", description: "Absolute quantity to set" },
          disconnect_if_necessary: { type: "boolean", description: "Disconnect from other locations if needed" },
        },
        required: ["location_id", "inventory_item_id", "available"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "adjust_inventory_level",
      title: "Adjust Inventory Level",
      description: "Adjust inventory quantity by a relative amount (positive or negative delta). Safer than set_inventory_level when concurrent adjustments may occur. Returns updated inventory level.",
      inputSchema: {
        type: "object",
        properties: {
          location_id: { type: "number", description: "Location ID" },
          inventory_item_id: { type: "number", description: "Inventory item ID" },
          available_adjustment: { type: "number", description: "Delta to apply (positive to add, negative to subtract)" },
        },
        required: ["location_id", "inventory_item_id", "available_adjustment"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "connect_inventory_level",
      title: "Connect Inventory Level",
      description: "Connect an inventory item to a location, enabling inventory tracking at that location. Required before setting inventory levels at a new location.",
      inputSchema: {
        type: "object",
        properties: {
          location_id: { type: "number", description: "Location ID to connect to" },
          inventory_item_id: { type: "number", description: "Inventory item ID" },
          relocate_if_necessary: { type: "boolean", description: "Relocate from other locations if needed" },
        },
        required: ["location_id", "inventory_item_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "disconnect_inventory_level",
      title: "Disconnect Inventory Level",
      description: "Disconnect an inventory item from a location, removing inventory tracking at that location. The item will no longer show stock at this location.",
      inputSchema: {
        type: "object",
        properties: {
          location_id: { type: "number", description: "Location ID" },
          inventory_item_id: { type: "number", description: "Inventory item ID" },
        },
        required: ["location_id", "inventory_item_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_inventory_levels: async (args) => {
      const params = ListInventoryLevelsSchema.parse(args);
      const qs = new URLSearchParams({ limit: String(params.limit) });
      if (params.inventory_item_ids) qs.set("inventory_item_ids", params.inventory_item_ids);
      if (params.location_ids) qs.set("location_ids", params.location_ids);
      if (params.updated_at_min) qs.set("updated_at_min", params.updated_at_min);
      if (params.page_info) qs.set("page_info", params.page_info);
      const data = await logger.time("tool.list_inventory_levels", () =>
        client.get<{ inventory_levels: ShopifyInventoryLevel[] }>(`/inventory_levels.json?${qs}`)
      , { tool: "list_inventory_levels" });
      const levels = (data as { inventory_levels: ShopifyInventoryLevel[] }).inventory_levels;
      const response = { data: levels, meta: { count: levels.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    set_inventory_level: async (args) => {
      const params = SetInventoryLevelSchema.parse(args);
      const data = await logger.time("tool.set_inventory_level", () =>
        client.post<{ inventory_level: ShopifyInventoryLevel }>("/inventory_levels/set.json", params)
      , { tool: "set_inventory_level" });
      const level = (data as { inventory_level: ShopifyInventoryLevel }).inventory_level;
      return { content: [{ type: "text", text: JSON.stringify(level, null, 2) }], structuredContent: level as Record<string, unknown> };
    },

    adjust_inventory_level: async (args) => {
      const params = AdjustInventoryLevelSchema.parse(args);
      const data = await logger.time("tool.adjust_inventory_level", () =>
        client.post<{ inventory_level: ShopifyInventoryLevel }>("/inventory_levels/adjust.json", params)
      , { tool: "adjust_inventory_level" });
      const level = (data as { inventory_level: ShopifyInventoryLevel }).inventory_level;
      return { content: [{ type: "text", text: JSON.stringify(level, null, 2) }], structuredContent: level as Record<string, unknown> };
    },

    connect_inventory_level: async (args) => {
      const params = ConnectInventoryLevelSchema.parse(args);
      const data = await logger.time("tool.connect_inventory_level", () =>
        client.post<{ inventory_level: ShopifyInventoryLevel }>("/inventory_levels/connect.json", params)
      , { tool: "connect_inventory_level" });
      const level = (data as { inventory_level: ShopifyInventoryLevel }).inventory_level;
      return { content: [{ type: "text", text: JSON.stringify(level, null, 2) }], structuredContent: level as Record<string, unknown> };
    },

    disconnect_inventory_level: async (args) => {
      const { location_id, inventory_item_id } = DeleteInventoryLevelSchema.parse(args);
      await logger.time("tool.disconnect_inventory_level", () =>
        client.delete(`/inventory_levels.json?location_id=${location_id}&inventory_item_id=${inventory_item_id}`)
      , { tool: "disconnect_inventory_level" });
      const result = { success: true, location_id, inventory_item_id };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
