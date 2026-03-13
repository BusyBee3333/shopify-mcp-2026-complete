// Translations tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_translatable_resources, get_translations, register_translations, remove_translations

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListTranslatableResourcesSchema = z.object({
  resourceType: z.enum([
    "PRODUCT", "PRODUCT_VARIANT", "PRODUCT_OPTION", "COLLECTION",
    "BLOG", "ARTICLE", "PAGE", "SHOP", "SHOP_POLICY",
    "EMAIL_TEMPLATE", "METAFIELD", "LINK", "DELIVERY_METHOD_DEFINITION",
    "PAYMENT_GATEWAY", "SHIPPING_METHOD",
  ]).describe("Type of resources to list"),
  first: z.number().min(1).max(250).optional().default(50).describe("Number of resources to return"),
  after: z.string().optional().describe("Pagination cursor"),
});

const GetTranslationsSchema = z.object({
  resourceId: z.string().describe("GID of the resource (e.g. gid://shopify/Product/123)"),
  locale: z.string().describe("Locale code (e.g. fr, de, es-ES)"),
});

const RegisterTranslationsSchema = z.object({
  resourceId: z.string().describe("GID of the resource to translate"),
  translations: z.array(z.object({
    locale: z.string().describe("Locale code (e.g. fr, de)"),
    key: z.string().describe("Translation key (e.g. title, body_html, description)"),
    value: z.string().describe("Translated text value"),
    translatableContentDigest: z.string().optional().describe("Digest of the original content for consistency check"),
  })).describe("Array of translations to register"),
});

const RemoveTranslationsSchema = z.object({
  resourceId: z.string().describe("GID of the resource"),
  translationKeys: z.array(z.object({
    locale: z.string().describe("Locale code"),
    key: z.string().describe("Translation key to remove"),
  })).describe("Array of locale/key pairs to remove"),
});

const ListShopLocalesSchema = z.object({});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_translatable_resources",
      title: "List Translatable Resources",
      description: "List resources of a given type that can be translated (PRODUCT, COLLECTION, PAGE, BLOG, ARTICLE, SHOP, etc.). Returns resource GIDs and their translatable content keys with current values.",
      inputSchema: {
        type: "object",
        properties: {
          resourceType: {
            type: "string",
            enum: ["PRODUCT", "PRODUCT_VARIANT", "COLLECTION", "BLOG", "ARTICLE", "PAGE", "SHOP", "SHOP_POLICY", "EMAIL_TEMPLATE", "METAFIELD", "LINK", "PAYMENT_GATEWAY", "SHIPPING_METHOD"],
            description: "Resource type to list",
          },
          first: { type: "number", description: "Number to return (default 50)" },
          after: { type: "string", description: "Pagination cursor" },
        },
        required: ["resourceType"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_translations",
      title: "Get Translations",
      description: "Get all translations for a specific resource in a given locale. Returns translation keys, translated values, and their status.",
      inputSchema: {
        type: "object",
        properties: {
          resourceId: { type: "string", description: "Resource GID (e.g. gid://shopify/Product/123)" },
          locale: { type: "string", description: "Locale code (e.g. fr, de, es-ES)" },
        },
        required: ["resourceId", "locale"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "register_translations",
      title: "Register Translations",
      description: "Create or update translations for a Shopify resource. Provide locale, key, and translated value for each field. Supports translating product titles, descriptions, page content, and more.",
      inputSchema: {
        type: "object",
        properties: {
          resourceId: { type: "string", description: "Resource GID to translate" },
          translations: {
            type: "array",
            description: "Array of {locale, key, value, translatableContentDigest} translation objects",
          },
        },
        required: ["resourceId", "translations"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "remove_translations",
      title: "Remove Translations",
      description: "Remove specific translations from a resource. Removes translation keys for given locales, reverting to the default store language for those fields.",
      inputSchema: {
        type: "object",
        properties: {
          resourceId: { type: "string", description: "Resource GID" },
          translationKeys: {
            type: "array",
            description: "Array of {locale, key} pairs to remove",
          },
        },
        required: ["resourceId", "translationKeys"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_translatable_resources: async (args) => {
      const params = ListTranslatableResourcesSchema.parse(args);
      const query = `
        query getTranslatableResources($resourceType: TranslatableResourceType!, $first: Int!, $after: String) {
          translatableResources(resourceType: $resourceType, first: $first, after: $after) {
            edges {
              cursor
              node {
                resourceId
                translatableContent { key value digest locale }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await logger.time("tool.list_translatable_resources", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { resourceType: params.resourceType, first: params.first, after: params.after },
        })
      , { tool: "list_translatable_resources" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_translations: async (args) => {
      const { resourceId, locale } = GetTranslationsSchema.parse(args);
      const query = `
        query getTranslations($resourceId: ID!, $locale: String!) {
          translatableResource(resourceId: $resourceId) {
            resourceId
            translations(locale: $locale) {
              key
              locale
              value
              outdated
              updatedAt
            }
          }
        }
      `;
      const data = await logger.time("tool.get_translations", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { resourceId, locale },
        })
      , { tool: "get_translations" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    register_translations: async (args) => {
      const { resourceId, translations } = RegisterTranslationsSchema.parse(args);
      const query = `
        mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
          translationsRegister(resourceId: $resourceId, translations: $translations) {
            translations { key locale value }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.register_translations", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { resourceId, translations },
        })
      , { tool: "register_translations" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    remove_translations: async (args) => {
      const { resourceId, translationKeys } = RemoveTranslationsSchema.parse(args);
      const query = `
        mutation translationsRemove($resourceId: ID!, $translationKeys: [TranslationKeyInput!]!) {
          translationsRemove(resourceId: $resourceId, translationKeys: $translationKeys) {
            translations { key locale }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.remove_translations", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { resourceId, translationKeys },
        })
      , { tool: "remove_translations" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
