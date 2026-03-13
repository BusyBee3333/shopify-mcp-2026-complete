// Markets tools — Shopify Admin API 2024-01
// Covers: list_markets, get_market, create_market, update_market
// Markets API enables international selling with market-specific pricing, currencies, and domains.

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyMarketRegion {
  id?: string;
  name?: string;
  countries?: Array<{ code?: string; name?: string; currency?: { iso_code?: string } }>;
}

interface ShopifyMarket {
  id?: number;
  name?: string;
  handle?: string;
  enabled?: boolean;
  primary?: boolean;
  web_presence?: {
    domain?: { id?: number; host?: string } | null;
    alternate_locales?: string[];
    default_locale?: string;
    root_urls?: Array<{ locale?: string; url?: string }>;
  } | null;
  regions?: ShopifyMarketRegion[];
  currencies?: Array<{ currency_code?: string; enabled?: boolean }>;
  price_rounding?: string | null;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListMarketsSchema = z.object({
  // Shopify Markets list is typically small (few markets per store), no pagination needed
});

const GetMarketSchema = z.object({
  market_id: z.string().describe("Shopify market ID"),
});

const CreateMarketSchema = z.object({
  name: z.string().describe("Market name (e.g. 'Europe', 'North America')"),
  regions: z.array(z.object({
    countries: z.array(z.object({
      code: z.string().describe("ISO 3166-1 alpha-2 country code (e.g. 'DE', 'FR', 'US')"),
    })).describe("Countries to include in this region"),
  })).describe("Geographic regions for this market — each region contains one or more countries"),
  enabled: z.boolean().optional().default(true).describe("Whether the market is enabled (default: true)"),
  currencies: z.array(z.object({
    currency_code: z.string().describe("ISO 4217 currency code (e.g. 'EUR', 'GBP')"),
    enabled: z.boolean().optional().default(true),
  })).optional().describe("Currencies to accept in this market"),
});

const UpdateMarketSchema = z.object({
  market_id: z.string().describe("Shopify market ID"),
  name: z.string().optional().describe("Updated market name"),
  enabled: z.boolean().optional().describe("Enable or disable the market"),
  currencies: z.array(z.object({
    currency_code: z.string().describe("ISO 4217 currency code"),
    enabled: z.boolean().optional(),
  })).optional().describe("Updated currency settings"),
  price_rounding: z.string().optional().describe("Price rounding rule for this market"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_markets",
      title: "List Markets",
      description:
        "List all Shopify Markets configured for international selling. Returns market name, regions/countries, enabled status, currencies, and web presence (domain/locale). The primary market is your default store locale. Use to audit international selling configuration.",
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
      name: "get_market",
      title: "Get Market",
      description:
        "Get full details for a specific Shopify market by ID. Returns name, regions, currencies, web presence (custom domain and locales), and enabled status.",
      inputSchema: {
        type: "object",
        properties: {
          market_id: { type: "string", description: "Shopify market ID" },
        },
        required: ["market_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, name: { type: "string" }, enabled: { type: "boolean" },
          primary: { type: "boolean" }, regions: { type: "array" }, currencies: { type: "array" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_market",
      title: "Create Market",
      description:
        "Create a new Shopify Market for international selling. Specify the market name, geographic regions (countries), and optional currencies. Once created, you can configure market-specific pricing, currencies, and domains.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Market name (e.g. 'Europe', 'APAC')" },
          regions: {
            type: "array",
            description: "Geographic regions with country codes",
            items: {
              type: "object",
              properties: {
                countries: {
                  type: "array",
                  items: { type: "object", properties: { code: { type: "string" } } },
                },
              },
            },
          },
          enabled: { type: "boolean", description: "Enable immediately (default: true)" },
          currencies: {
            type: "array",
            description: "Accepted currencies",
            items: {
              type: "object",
              properties: { currency_code: { type: "string" }, enabled: { type: "boolean" } },
            },
          },
        },
        required: ["name", "regions"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, name: { type: "string" }, enabled: { type: "boolean" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_market",
      title: "Update Market",
      description:
        "Update an existing Shopify market's name, enabled status, currency settings, or price rounding. Returns the updated market. Use to enable/disable a market or adjust currency configuration.",
      inputSchema: {
        type: "object",
        properties: {
          market_id: { type: "string", description: "Shopify market ID" },
          name: { type: "string", description: "Updated market name" },
          enabled: { type: "boolean", description: "Enable or disable the market" },
          currencies: {
            type: "array",
            description: "Updated currency settings",
            items: {
              type: "object",
              properties: { currency_code: { type: "string" }, enabled: { type: "boolean" } },
            },
          },
          price_rounding: { type: "string", description: "Price rounding rule" },
        },
        required: ["market_id"],
      },
      outputSchema: {
        type: "object",
        properties: { id: { type: "number" }, name: { type: "string" }, enabled: { type: "boolean" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_markets: async (_args) => {
      ListMarketsSchema.parse(_args);

      const data = await logger.time("tool.list_markets", () =>
        client.get<{ markets: ShopifyMarket[] }>("/markets.json")
      , { tool: "list_markets" });

      const markets = (data as { markets: ShopifyMarket[] }).markets || [];
      const response = { data: markets, meta: { count: markets.length } };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_market: async (args) => {
      const { market_id } = GetMarketSchema.parse(args);
      const data = await logger.time("tool.get_market", () =>
        client.get<{ market: ShopifyMarket }>(`/markets/${market_id}.json`)
      , { tool: "get_market", market_id });

      const market = (data as { market: ShopifyMarket }).market;

      return {
        content: [{ type: "text", text: JSON.stringify(market, null, 2) }],
        structuredContent: market,
      };
    },

    create_market: async (args) => {
      const params = CreateMarketSchema.parse(args);
      const data = await logger.time("tool.create_market", () =>
        client.post<{ market: ShopifyMarket }>("/markets.json", { market: params })
      , { tool: "create_market" });

      const market = (data as { market: ShopifyMarket }).market;

      return {
        content: [{ type: "text", text: JSON.stringify(market, null, 2) }],
        structuredContent: market,
      };
    },

    update_market: async (args) => {
      const { market_id, ...updateData } = UpdateMarketSchema.parse(args);
      const data = await logger.time("tool.update_market", () =>
        client.put<{ market: ShopifyMarket }>(`/markets/${market_id}.json`, { market: updateData })
      , { tool: "update_market", market_id });

      const market = (data as { market: ShopifyMarket }).market;

      return {
        content: [{ type: "text", text: JSON.stringify(market, null, 2) }],
        structuredContent: market,
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
