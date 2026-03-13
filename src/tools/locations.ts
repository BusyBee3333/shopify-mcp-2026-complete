// Locations tools — Shopify Admin API 2024-01
// Covers: list_locations, get_location, list_location_inventory

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler, ShopifyInventoryLevel } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyLocation {
  id?: number;
  name?: string;
  address1?: string;
  address2?: string | null;
  city?: string;
  zip?: string;
  province?: string;
  country?: string;
  country_code?: string;
  province_code?: string | null;
  phone?: string | null;
  active?: boolean;
  legacy?: boolean;
  admin_graphql_api_id?: string;
  localized_country_name?: string;
  localized_province_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListLocationsSchema = z.object({
  // Shopify Locations API doesn't support pagination via page_info (small resource set)
  // but we'll keep it consistent
});

const GetLocationSchema = z.object({
  location_id: z.string().describe("Shopify location ID"),
});

const ListLocationInventorySchema = z.object({
  location_id: z.string().describe("Shopify location ID to list inventory for"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_locations",
      title: "List Locations",
      description:
        "List all locations (physical stores, warehouses, dropshipping partners) configured on the Shopify store. Returns location name, full address, active status, and whether it is a legacy location. Locations are used for inventory management and fulfillment routing.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_location",
      title: "Get Location",
      description:
        "Get full details for a specific Shopify location by ID. Returns name, full address, phone, active status, and timestamps. Use after list_locations to get details for a specific fulfillment location.",
      inputSchema: {
        type: "object",
        properties: {
          location_id: { type: "string", description: "Shopify location ID" },
        },
        required: ["location_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, name: { type: "string" }, address1: { type: "string" },
          city: { type: "string" }, country_code: { type: "string" }, active: { type: "boolean" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_location_inventory",
      title: "List Location Inventory",
      description:
        "List all inventory levels for a specific Shopify location. Returns inventory_item_id, available quantity, and update timestamps for every tracked SKU at that location. Use with list_locations to audit stock across your fulfillment network.",
      inputSchema: {
        type: "object",
        properties: {
          location_id: { type: "string", description: "Shopify location ID" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
        required: ["location_id"],
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
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_locations: async (_args) => {
      ListLocationsSchema.parse(_args);

      const data = await logger.time("tool.list_locations", () =>
        client.get<{ locations: ShopifyLocation[] }>("/locations.json")
      , { tool: "list_locations" });

      const locations = (data as { locations: ShopifyLocation[] }).locations || [];
      const response = { data: locations, meta: { count: locations.length } };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_location: async (args) => {
      const { location_id } = GetLocationSchema.parse(args);
      const data = await logger.time("tool.get_location", () =>
        client.get<{ location: ShopifyLocation }>(`/locations/${location_id}.json`)
      , { tool: "get_location", location_id });

      const location = (data as { location: ShopifyLocation }).location;

      return {
        content: [{ type: "text", text: JSON.stringify(location, null, 2) }],
        structuredContent: location,
      };
    },

    list_location_inventory: async (args) => {
      const params = ListLocationInventorySchema.parse(args);
      let result: { data: ShopifyInventoryLevel[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_location_inventory", () =>
          client.paginateFromCursor<ShopifyInventoryLevel>(
            `/locations/${params.location_id}/inventory_levels.json`,
            params.page_info!,
            params.limit
          )
        , { tool: "list_location_inventory" });
      } else {
        result = await logger.time("tool.list_location_inventory", () =>
          client.paginatedGet<ShopifyInventoryLevel>(
            `/locations/${params.location_id}/inventory_levels.json`,
            {},
            params.limit
          )
        , { tool: "list_location_inventory" });
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
  };
}

export function getTools(client: ShopifyClient) {
  return {
    tools: getToolDefinitions(),
    handlers: getToolHandlers(client),
  };
}
