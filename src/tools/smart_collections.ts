// Smart Collections tools — Shopify Admin API 2024-01
// Covers: list_smart_collections, get_smart_collection, create_smart_collection,
//         update_smart_collection, delete_smart_collection, update_smart_collection_order

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface SmartCollectionRule {
  column: string;
  relation: string;
  condition: string;
}

interface ShopifySmartCollection {
  id: number;
  title: string;
  handle?: string;
  body_html?: string | null;
  published_at?: string | null;
  published_scope?: string;
  sort_order?: string;
  disjunctive?: boolean;
  rules?: SmartCollectionRule[];
  image?: { src: string; alt?: string } | null;
  products_count?: number;
  updated_at?: string;
}

// === Zod Schemas ===
const RuleSchema = z.object({
  column: z.enum(["title", "type", "vendor", "variant_price", "tag", "variant_compare_at_price", "variant_weight", "variant_inventory", "variant_title"]).describe("Product attribute to match"),
  relation: z.enum(["equals", "not_equals", "greater_than", "less_than", "starts_with", "ends_with", "contains", "not_contains"]),
  condition: z.string().describe("Value to compare against"),
});

const ListSmartCollectionsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  title: z.string().optional(),
  product_id: z.string().optional().describe("Filter to collections containing this product"),
  published_status: z.enum(["published", "unpublished", "any"]).optional().default("any"),
});

const GetSmartCollectionSchema = z.object({
  collection_id: z.string(),
});

const CreateSmartCollectionSchema = z.object({
  title: z.string(),
  rules: z.array(RuleSchema).min(1).describe("Rules that define which products are included"),
  disjunctive: z.boolean().optional().default(false).describe("false = products match ALL rules (AND); true = products match ANY rule (OR)"),
  body_html: z.string().optional(),
  published: z.boolean().optional(),
  sort_order: z.enum(["alpha-asc", "alpha-desc", "best-selling", "created", "created-desc", "manual", "price-asc", "price-desc"]).optional(),
  image: z.object({ src: z.string().url(), alt: z.string().optional() }).optional(),
});

const UpdateSmartCollectionSchema = z.object({
  collection_id: z.string(),
  title: z.string().optional(),
  body_html: z.string().optional(),
  rules: z.array(RuleSchema).optional(),
  disjunctive: z.boolean().optional(),
  published: z.boolean().optional(),
  sort_order: z.string().optional(),
});

const DeleteSmartCollectionSchema = z.object({
  collection_id: z.string(),
});

const UpdateSmartCollectionOrderSchema = z.object({
  collection_id: z.string(),
  products: z.array(z.object({ id: z.number() })).describe("Array of {id: product_id} in desired order"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_smart_collections",
      title: "List Smart Collections",
      description: "List all rule-based (smart) collections. Smart collections automatically include products based on conditions like tag, price, vendor, or title.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          title: { type: "string" },
          product_id: { type: "string" },
          published_status: { type: "string", enum: ["published", "unpublished", "any"] },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_smart_collection",
      title: "Get Smart Collection",
      description: "Get a smart collection by ID, including its rules, sort order, and disjunctive setting.",
      inputSchema: {
        type: "object",
        properties: { collection_id: { type: "string" } },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_smart_collection",
      title: "Create Smart Collection",
      description: "Create a rule-based collection that automatically includes products matching the rules. Set disjunctive=false (AND logic) or disjunctive=true (OR logic).",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          rules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                relation: { type: "string" },
                condition: { type: "string" },
              },
              required: ["column", "relation", "condition"],
            },
          },
          disjunctive: { type: "boolean" },
          body_html: { type: "string" },
          published: { type: "boolean" },
          sort_order: { type: "string" },
        },
        required: ["title", "rules"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_smart_collection",
      title: "Update Smart Collection",
      description: "Update a smart collection's title, description, rules, or publish status.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
          title: { type: "string" },
          body_html: { type: "string" },
          rules: { type: "array", items: { type: "object" } },
          disjunctive: { type: "boolean" },
          published: { type: "boolean" },
          sort_order: { type: "string" },
        },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_smart_collection",
      title: "Delete Smart Collection",
      description: "Permanently delete a smart collection. Products are not deleted. Cannot be undone.",
      inputSchema: {
        type: "object",
        properties: { collection_id: { type: "string" } },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_smart_collection_order",
      title: "Update Smart Collection Product Order",
      description: "Manually reorder products within a smart collection (only valid when sort_order=manual). Provide products array with IDs in the desired sequence.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
          products: {
            type: "array",
            items: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
          },
        },
        required: ["collection_id", "products"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_smart_collections: async (args) => {
      const params = ListSmartCollectionsSchema.parse(args);
      let result: { data: ShopifySmartCollection[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_smart_collections", () =>
          client.paginateFromCursor<ShopifySmartCollection>("/smart_collections.json", params.page_info!, params.limit)
        , { tool: "list_smart_collections" });
      } else {
        const extra: Record<string, string> = {};
        if (params.title) extra.title = params.title;
        if (params.product_id) extra.product_id = params.product_id;
        if (params.published_status && params.published_status !== "any") extra.published_status = params.published_status;
        result = await logger.time("tool.list_smart_collections", () =>
          client.paginatedGet<ShopifySmartCollection>("/smart_collections.json", extra, params.limit)
        , { tool: "list_smart_collections" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_smart_collection: async (args) => {
      const { collection_id } = GetSmartCollectionSchema.parse(args);
      const data = await logger.time("tool.get_smart_collection", () =>
        client.get<{ smart_collection: ShopifySmartCollection }>(`/smart_collections/${collection_id}.json`)
      , { tool: "get_smart_collection" });
      const col = (data as { smart_collection: ShopifySmartCollection }).smart_collection;
      return { content: [{ type: "text", text: JSON.stringify(col, null, 2) }], structuredContent: col };
    },

    create_smart_collection: async (args) => {
      const params = CreateSmartCollectionSchema.parse(args);
      const data = await logger.time("tool.create_smart_collection", () =>
        client.post<{ smart_collection: ShopifySmartCollection }>("/smart_collections.json", { smart_collection: params })
      , { tool: "create_smart_collection" });
      const col = (data as { smart_collection: ShopifySmartCollection }).smart_collection;
      return { content: [{ type: "text", text: JSON.stringify(col, null, 2) }], structuredContent: col };
    },

    update_smart_collection: async (args) => {
      const { collection_id, ...updateData } = UpdateSmartCollectionSchema.parse(args);
      const data = await logger.time("tool.update_smart_collection", () =>
        client.put<{ smart_collection: ShopifySmartCollection }>(`/smart_collections/${collection_id}.json`, { smart_collection: updateData })
      , { tool: "update_smart_collection" });
      const col = (data as { smart_collection: ShopifySmartCollection }).smart_collection;
      return { content: [{ type: "text", text: JSON.stringify(col, null, 2) }], structuredContent: col };
    },

    delete_smart_collection: async (args) => {
      const { collection_id } = DeleteSmartCollectionSchema.parse(args);
      await logger.time("tool.delete_smart_collection", () =>
        client.delete<unknown>(`/smart_collections/${collection_id}.json`)
      , { tool: "delete_smart_collection" });
      const response = { success: true, collection_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    update_smart_collection_order: async (args) => {
      const { collection_id, products } = UpdateSmartCollectionOrderSchema.parse(args);
      const qs = products.map((p, i) => `products[${i}][id]=${p.id}`).join("&");
      await logger.time("tool.update_smart_collection_order", () =>
        client.put<unknown>(`/smart_collections/${collection_id}/order.json?${qs}`, {})
      , { tool: "update_smart_collection_order" });
      const response = { success: true, collection_id, reordered: products.length };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
