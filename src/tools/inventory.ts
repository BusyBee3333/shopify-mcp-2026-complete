// Inventory tools — Shopify Admin API 2024-01
// Covers: get_inventory, update_inventory

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler, ShopifyInventoryLevel } from "../types.js";
import { logger } from "../logger.js";

// === Zod Schemas ===
const GetInventorySchema = z.object({
  inventory_item_ids: z.string().optional().describe("Comma-separated inventory item IDs to filter (from variant.inventory_item_id)"),
  location_ids: z.string().optional().describe("Comma-separated location IDs to filter"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (default 50)"),
});

const UpdateInventorySchema = z.object({
  location_id: z.string().describe("Shopify location ID where inventory is stored"),
  inventory_item_id: z.string().describe("Inventory item ID (from variant.inventory_item_id)"),
  available: z.number().describe("New available inventory quantity (absolute value, not delta)"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_inventory",
      title: "Get Inventory Levels",
      description:
        "Get current inventory levels for one or more inventory items across locations. inventory_item_id is found on product variants. Returns available quantity per location. Use when checking stock levels for specific variants or across locations.",
      inputSchema: {
        type: "object",
        properties: {
          inventory_item_ids: { type: "string", description: "Comma-separated inventory item IDs (from variant.inventory_item_id)" },
          location_ids: { type: "string", description: "Comma-separated location IDs to filter" },
          limit: { type: "number", description: "Number of results (default 50, max 250)" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                inventory_item_id: { type: "number" },
                location_id: { type: "number" },
                available: { type: "number" },
                updated_at: { type: "string" },
              },
            },
          },
          meta: {
            type: "object",
            properties: {
              count: { type: "number" },
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
      name: "update_inventory",
      title: "Update Inventory Level",
      description:
        "Set the inventory level for a specific variant at a specific location. The 'available' value is an absolute count (not a delta). To get inventory_item_id, use get_product and check variant.inventory_item_id. To get location IDs, use the Shopify admin. Returns updated inventory level.",
      inputSchema: {
        type: "object",
        properties: {
          location_id: { type: "string", description: "Shopify location ID" },
          inventory_item_id: { type: "string", description: "Inventory item ID (from variant.inventory_item_id)" },
          available: { type: "number", description: "New available inventory quantity (absolute value)" },
        },
        required: ["location_id", "inventory_item_id", "available"],
      },
      outputSchema: {
        type: "object",
        properties: {
          inventory_item_id: { type: "number" },
          location_id: { type: "number" },
          available: { type: "number" },
          updated_at: { type: "string" },
        },
        required: ["inventory_item_id", "location_id"],
      },
      annotations: {
        readOnlyHint: false,
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
    get_inventory: async (args) => {
      const params = GetInventorySchema.parse(args);

      const extraParams: Record<string, string> = {};
      if (params.inventory_item_ids) extraParams.inventory_item_ids = params.inventory_item_ids;
      if (params.location_ids) extraParams.location_ids = params.location_ids;

      const result = await logger.time("tool.get_inventory", () =>
        client.paginatedGet<ShopifyInventoryLevel>("/inventory_levels.json", extraParams, params.limit)
      , { tool: "get_inventory" });

      const response = {
        data: result.data,
        meta: { count: result.data.length },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    update_inventory: async (args) => {
      const params = UpdateInventorySchema.parse(args);

      // Shopify uses /inventory_levels/set.json to set absolute quantities
      const data = await logger.time("tool.update_inventory", () =>
        client.post<{ inventory_level: ShopifyInventoryLevel }>("/inventory_levels/set.json", {
          location_id: Number(params.location_id),
          inventory_item_id: Number(params.inventory_item_id),
          available: params.available,
        })
      , { tool: "update_inventory" });

      const level = (data as { inventory_level: ShopifyInventoryLevel }).inventory_level;

      return {
        content: [{ type: "text", text: JSON.stringify(level, null, 2) }],
        structuredContent: level,
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
