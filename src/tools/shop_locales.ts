// Shop Locales tools — Shopify Admin API 2024-01
// Covers: list_shop_locales, enable_locale, update_locale, disable_locale

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyShopLocale {
  locale?: string;
  name?: string;
  primary?: boolean;
  published?: boolean;
}

const ListShopLocalesSchema = z.object({
  published: z.boolean().optional().describe("Filter by published status"),
});

const EnableLocaleSchema = z.object({
  locale: z.string().describe("Locale code to enable (e.g. fr, de, es, ja, zh-CN)"),
  published: z.boolean().optional().default(false).describe("Publish locale immediately"),
});

const UpdateLocaleSchema = z.object({
  locale: z.string().describe("Locale code to update"),
  published: z.boolean().describe("Whether to publish this locale"),
});

const DisableLocaleSchema = z.object({
  locale: z.string().describe("Locale code to disable/remove"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_shop_locales",
      title: "List Shop Locales",
      description: "List all locales enabled on the store. Returns locale codes (e.g. en, fr, de), names, and whether each is published (visible to customers) or just enabled for translation.",
      inputSchema: {
        type: "object",
        properties: {
          published: { type: "boolean", description: "Filter by published status" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "enable_shop_locale",
      title: "Enable Shop Locale",
      description: "Enable a new locale on the store to allow translations. Optionally publish it immediately. After enabling, use the translations API to add translated content.",
      inputSchema: {
        type: "object",
        properties: {
          locale: { type: "string", description: "Locale code (e.g. fr, de, es, ja, zh-CN)" },
          published: { type: "boolean", description: "Publish immediately (visible to customers)" },
        },
        required: ["locale"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "update_shop_locale",
      title: "Update Shop Locale",
      description: "Update a shop locale's published status. Publish to make the locale visible to customers, or unpublish to hide it while keeping translations.",
      inputSchema: {
        type: "object",
        properties: {
          locale: { type: "string", description: "Locale code" },
          published: { type: "boolean", description: "Published status" },
        },
        required: ["locale", "published"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "disable_shop_locale",
      title: "Disable Shop Locale",
      description: "Remove a locale from the store. All translations for this locale will be removed. The primary locale cannot be disabled.",
      inputSchema: {
        type: "object",
        properties: { locale: { type: "string", description: "Locale code to disable" } },
        required: ["locale"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_shop_locales: async (args) => {
      const { published } = ListShopLocalesSchema.parse(args);
      const qs = new URLSearchParams();
      if (published !== undefined) qs.set("published", String(published));
      const data = await logger.time("tool.list_shop_locales", () =>
        client.get<{ shop_locales: ShopifyShopLocale[] }>(`/shop_locales.json?${qs}`)
      , { tool: "list_shop_locales" });
      const locales = (data as { shop_locales: ShopifyShopLocale[] }).shop_locales;
      const response = { data: locales, meta: { count: locales.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    enable_shop_locale: async (args) => {
      const params = EnableLocaleSchema.parse(args);
      const data = await logger.time("tool.enable_shop_locale", () =>
        client.post<{ shop_locale: ShopifyShopLocale }>("/shop_locales.json", { shop_locale: params })
      , { tool: "enable_shop_locale" });
      const locale = (data as { shop_locale: ShopifyShopLocale }).shop_locale;
      return { content: [{ type: "text", text: JSON.stringify(locale, null, 2) }], structuredContent: locale as Record<string, unknown> };
    },

    update_shop_locale: async (args) => {
      const { locale, published } = UpdateLocaleSchema.parse(args);
      const data = await logger.time("tool.update_shop_locale", () =>
        client.put<{ shop_locale: ShopifyShopLocale }>(`/shop_locales/${locale}.json`, { shop_locale: { published } })
      , { tool: "update_shop_locale" });
      const shopLocale = (data as { shop_locale: ShopifyShopLocale }).shop_locale;
      return { content: [{ type: "text", text: JSON.stringify(shopLocale, null, 2) }], structuredContent: shopLocale as Record<string, unknown> };
    },

    disable_shop_locale: async (args) => {
      const { locale } = DisableLocaleSchema.parse(args);
      await logger.time("tool.disable_shop_locale", () =>
        client.delete(`/shop_locales/${locale}.json`)
      , { tool: "disable_shop_locale" });
      const result = { success: true, disabled_locale: locale };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
