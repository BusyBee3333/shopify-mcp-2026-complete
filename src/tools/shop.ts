// Shop tools — Shopify Admin API 2024-01
// Covers: get_shop, list_policies, list_countries, list_currencies, list_provinces

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyShop {
  id: number;
  name: string;
  email?: string;
  domain?: string;
  myshopify_domain?: string;
  plan_name?: string;
  plan_display_name?: string;
  country?: string;
  country_code?: string;
  currency?: string;
  money_format?: string;
  address1?: string;
  city?: string;
  province?: string;
  zip?: string;
  phone?: string;
  timezone?: string;
  iana_timezone?: string;
  created_at?: string;
  updated_at?: string;
  weight_unit?: string;
  enabled_presentment_currencies?: string[];
  primary_locale?: string;
}

// === Zod Schemas ===
const GetShopSchema = z.object({
  fields: z.string().optional().describe("Comma-separated fields to return"),
});

const ListCountriesSchema = z.object({
  since_id: z.string().optional(),
  fields: z.string().optional(),
});

const GetCountrySchema = z.object({
  country_id: z.string(),
});

const ListProvincesSchema = z.object({
  country_id: z.string().describe("Country ID to list provinces for"),
  since_id: z.string().optional(),
  fields: z.string().optional(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_shop",
      title: "Get Shop Info",
      description: "Get information about the Shopify store — name, domain, email, currency, country, plan, timezone, and available currencies. Use this to understand store configuration before other operations.",
      inputSchema: {
        type: "object",
        properties: {
          fields: { type: "string", description: "Comma-separated fields to return (default: all)" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_shop_policies",
      title: "List Shop Policies",
      description: "List the store's legal policies — refund, privacy, terms of service, shipping, and subscription policies. Returns the policy title, body HTML, and URL handle.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_countries",
      title: "List Countries",
      description: "List all countries and regions that have been configured in the store's shipping settings. Returns country name, code, tax rate, and shipping zones.",
      inputSchema: {
        type: "object",
        properties: {
          since_id: { type: "string" },
          fields: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_country",
      title: "Get Country",
      description: "Get details for a specific country by ID, including its provinces/states.",
      inputSchema: {
        type: "object",
        properties: { country_id: { type: "string" } },
        required: ["country_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_provinces",
      title: "List Provinces/States",
      description: "List provinces or states for a specific country configured in the store.",
      inputSchema: {
        type: "object",
        properties: {
          country_id: { type: "string" },
          since_id: { type: "string" },
          fields: { type: "string" },
        },
        required: ["country_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_currencies",
      title: "List Currencies",
      description: "List all currencies that the store is configured to accept. Returns the currency code and whether it's the store's default currency.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    get_shop: async (args) => {
      const { fields } = GetShopSchema.parse(args);
      const qs = fields ? `?fields=${encodeURIComponent(fields)}` : "";
      const data = await logger.time("tool.get_shop", () =>
        client.get<{ shop: ShopifyShop }>(`/shop.json${qs}`)
      , { tool: "get_shop" });
      const shop = (data as { shop: ShopifyShop }).shop;
      return { content: [{ type: "text", text: JSON.stringify(shop, null, 2) }], structuredContent: shop };
    },

    list_shop_policies: async (_args) => {
      const data = await logger.time("tool.list_shop_policies", () =>
        client.get<{ policies: unknown[] }>("/policies.json")
      , { tool: "list_shop_policies" });
      const policies = (data as { policies: unknown[] }).policies;
      const response = { data: policies, meta: { count: policies.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    list_countries: async (args) => {
      const params = ListCountriesSchema.parse(args);
      const qs = new URLSearchParams();
      if (params.since_id) qs.set("since_id", params.since_id);
      if (params.fields) qs.set("fields", params.fields);
      const endpoint = `/countries.json${qs.toString() ? "?" + qs.toString() : ""}`;
      const data = await logger.time("tool.list_countries", () =>
        client.get<{ countries: unknown[] }>(endpoint)
      , { tool: "list_countries" });
      const countries = (data as { countries: unknown[] }).countries;
      const response = { data: countries, meta: { count: countries.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_country: async (args) => {
      const { country_id } = GetCountrySchema.parse(args);
      const data = await logger.time("tool.get_country", () =>
        client.get<{ country: unknown }>(`/countries/${country_id}.json`)
      , { tool: "get_country" });
      const country = (data as { country: unknown }).country;
      return { content: [{ type: "text", text: JSON.stringify(country, null, 2) }], structuredContent: country as Record<string, unknown> };
    },

    list_provinces: async (args) => {
      const params = ListProvincesSchema.parse(args);
      const qs = new URLSearchParams();
      if (params.since_id) qs.set("since_id", params.since_id);
      if (params.fields) qs.set("fields", params.fields);
      const endpoint = `/countries/${params.country_id}/provinces.json${qs.toString() ? "?" + qs.toString() : ""}`;
      const data = await logger.time("tool.list_provinces", () =>
        client.get<{ provinces: unknown[] }>(endpoint)
      , { tool: "list_provinces" });
      const provinces = (data as { provinces: unknown[] }).provinces;
      const response = { data: provinces, meta: { count: provinces.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    list_currencies: async (_args) => {
      const data = await logger.time("tool.list_currencies", () =>
        client.get<{ currencies: unknown[] }>("/currencies.json")
      , { tool: "list_currencies" });
      const currencies = (data as { currencies: unknown[] }).currencies;
      const response = { data: currencies, meta: { count: currencies.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
