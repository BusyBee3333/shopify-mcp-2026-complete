// Shipping Zones tools — Shopify Admin API 2024-01
// Covers: list_shipping_zones

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyShippingZone {
  id: number;
  name: string;
  countries?: unknown[];
  price_based_shipping_rates?: unknown[];
  weight_based_shipping_rates?: unknown[];
  carrier_shipping_rate_providers?: unknown[];
}

// === Zod Schemas ===
const ListShippingZonesSchema = z.object({
  fields: z.string().optional().describe("Comma-separated fields to return"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_shipping_zones",
      title: "List Shipping Zones",
      description: "List all shipping zones configured in the store. Shipping zones define which countries/regions are served and what shipping rates (price-based, weight-based, or carrier-calculated) apply. Returns zones with their associated countries and rates.",
      inputSchema: {
        type: "object",
        properties: {
          fields: { type: "string", description: "Comma-separated fields to return" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_shipping_zones: async (args) => {
      const { fields } = ListShippingZonesSchema.parse(args);
      const qs = fields ? `?fields=${encodeURIComponent(fields)}` : "";
      const data = await logger.time("tool.list_shipping_zones", () =>
        client.get<{ shipping_zones: ShopifyShippingZone[] }>(`/shipping_zones.json${qs}`)
      , { tool: "list_shipping_zones" });
      const zones = (data as { shipping_zones: ShopifyShippingZone[] }).shipping_zones;
      const response = { data: zones, meta: { count: zones.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
