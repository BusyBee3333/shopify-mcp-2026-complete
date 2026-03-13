// Inventory Items tools — Shopify Admin API 2024-01
// Covers: list_inventory_items, get_inventory_item, update_inventory_item

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyInventoryItem {
  id: number;
  sku?: string;
  created_at?: string;
  updated_at?: string;
  requires_shipping?: boolean;
  cost?: string | null;
  country_code_of_origin?: string | null;
  province_code_of_origin?: string | null;
  harmonized_system_code?: string | null;
  tracked?: boolean;
  country_harmonized_system_codes?: unknown[];
  admin_graphql_api_id?: string;
}

// === Zod Schemas ===
const ListInventoryItemsSchema = z.object({
  ids: z.string().describe("Comma-separated inventory item IDs to retrieve (required — up to 100)"),
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
});

const GetInventoryItemSchema = z.object({
  inventory_item_id: z.string().describe("Inventory item ID (obtained from variant's inventory_item_id field)"),
});

const UpdateInventoryItemSchema = z.object({
  inventory_item_id: z.string(),
  sku: z.string().optional().describe("SKU code"),
  cost: z.string().optional().nullable().describe("Unit cost (for profit reporting)"),
  country_code_of_origin: z.string().optional().nullable().describe("ISO 2-letter country code"),
  province_code_of_origin: z.string().optional().nullable(),
  harmonized_system_code: z.string().optional().nullable().describe("HS tariff code for international shipping"),
  tracked: z.boolean().optional().describe("Whether to track inventory for this item"),
  requires_shipping: z.boolean().optional(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_inventory_items",
      title: "List Inventory Items",
      description: "Retrieve inventory items by a comma-separated list of IDs. Inventory items hold SKU, cost, country of origin, and HS code. Get inventory_item_id from a product variant.",
      inputSchema: {
        type: "object",
        properties: {
          ids: { type: "string", description: "Comma-separated inventory item IDs (max 100)" },
          limit: { type: "number" },
          page_info: { type: "string" },
        },
        required: ["ids"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_inventory_item",
      title: "Get Inventory Item",
      description: "Get a single inventory item by ID. Returns cost, SKU, country of origin, HS code, and whether inventory is tracked.",
      inputSchema: {
        type: "object",
        properties: { inventory_item_id: { type: "string" } },
        required: ["inventory_item_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "update_inventory_item",
      title: "Update Inventory Item",
      description: "Update an inventory item's SKU, cost, country of origin, HS code, or tracking status. Useful for setting unit costs for profit analysis and customs data for international shipping.",
      inputSchema: {
        type: "object",
        properties: {
          inventory_item_id: { type: "string" },
          sku: { type: "string" },
          cost: { type: "string" },
          country_code_of_origin: { type: "string" },
          province_code_of_origin: { type: "string" },
          harmonized_system_code: { type: "string" },
          tracked: { type: "boolean" },
          requires_shipping: { type: "boolean" },
        },
        required: ["inventory_item_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_inventory_items: async (args) => {
      const params = ListInventoryItemsSchema.parse(args);
      const qs = new URLSearchParams({ ids: params.ids, limit: String(params.limit) });
      if (params.page_info) qs.set("page_info", params.page_info);
      const data = await logger.time("tool.list_inventory_items", () =>
        client.get<{ inventory_items: ShopifyInventoryItem[] }>(`/inventory_items.json?${qs}`)
      , { tool: "list_inventory_items" });
      const items = (data as { inventory_items: ShopifyInventoryItem[] }).inventory_items;
      const response = { data: items, meta: { count: items.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_inventory_item: async (args) => {
      const { inventory_item_id } = GetInventoryItemSchema.parse(args);
      const data = await logger.time("tool.get_inventory_item", () =>
        client.get<{ inventory_item: ShopifyInventoryItem }>(`/inventory_items/${inventory_item_id}.json`)
      , { tool: "get_inventory_item" });
      const item = (data as { inventory_item: ShopifyInventoryItem }).inventory_item;
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }], structuredContent: item };
    },

    update_inventory_item: async (args) => {
      const { inventory_item_id, ...updateData } = UpdateInventoryItemSchema.parse(args);
      const data = await logger.time("tool.update_inventory_item", () =>
        client.put<{ inventory_item: ShopifyInventoryItem }>(`/inventory_items/${inventory_item_id}.json`, { inventory_item: updateData })
      , { tool: "update_inventory_item" });
      const item = (data as { inventory_item: ShopifyInventoryItem }).inventory_item;
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }], structuredContent: item };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
