// Custom Collections tools — Shopify Admin API 2024-01
// Covers: list_custom_collections, get_custom_collection, create_custom_collection,
//         update_custom_collection, delete_custom_collection,
//         list_collects, create_collect, delete_collect

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyCustomCollection {
  id: number;
  title: string;
  handle?: string;
  body_html?: string | null;
  published_at?: string | null;
  published_scope?: string;
  sort_order?: string;
  template_suffix?: string | null;
  image?: { src: string; alt?: string } | null;
  updated_at?: string;
}

interface ShopifyCollect {
  id: number;
  collection_id: number;
  product_id: number;
  created_at?: string;
  updated_at?: string;
  position?: number;
  sort_value?: string;
}

// === Zod Schemas ===
const ListCustomCollectionsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  title: z.string().optional().describe("Filter by title"),
  product_id: z.string().optional().describe("Filter collections containing this product"),
  published_status: z.enum(["published", "unpublished", "any"]).optional().default("any"),
});

const GetCustomCollectionSchema = z.object({
  collection_id: z.string().describe("Custom collection ID"),
});

const CreateCustomCollectionSchema = z.object({
  title: z.string().describe("Collection title"),
  body_html: z.string().optional().describe("Collection description (HTML)"),
  handle: z.string().optional().describe("URL handle (auto-generated if omitted)"),
  published: z.boolean().optional().describe("Whether to publish immediately"),
  sort_order: z.enum(["alpha-asc", "alpha-desc", "best-selling", "created", "created-desc", "manual", "price-asc", "price-desc"]).optional(),
  image: z.object({ src: z.string().url(), alt: z.string().optional() }).optional(),
});

const UpdateCustomCollectionSchema = z.object({
  collection_id: z.string(),
  title: z.string().optional(),
  body_html: z.string().optional(),
  published: z.boolean().optional(),
  sort_order: z.string().optional(),
  image: z.object({ src: z.string().url(), alt: z.string().optional() }).optional(),
});

const DeleteCustomCollectionSchema = z.object({
  collection_id: z.string(),
});

const ListCollectsSchema = z.object({
  collection_id: z.string().optional().describe("Filter by collection ID"),
  product_id: z.string().optional().describe("Filter by product ID"),
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
});

const CreateCollectSchema = z.object({
  collection_id: z.string().describe("Collection to add the product to"),
  product_id: z.string().describe("Product to add"),
  position: z.number().optional().describe("Position in collection (manual sort only)"),
});

const DeleteCollectSchema = z.object({
  collect_id: z.string().describe("Collect ID (not collection_id or product_id)"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_custom_collections",
      title: "List Custom Collections",
      description: "List all manually curated (custom) collections. Use this to browse collections, find their IDs, or filter by product. For automated rule-based collections, use smart_collections tools.",
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
      name: "get_custom_collection",
      title: "Get Custom Collection",
      description: "Get a custom collection by ID including its title, description, sort order, image, and publication status.",
      inputSchema: {
        type: "object",
        properties: { collection_id: { type: "string" } },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_custom_collection",
      title: "Create Custom Collection",
      description: "Create a new manually-curated collection. Products must be added separately using create_collect. Supports title, description, sort order, image, and publish status.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          body_html: { type: "string" },
          handle: { type: "string" },
          published: { type: "boolean" },
          sort_order: { type: "string" },
          image: { type: "object", properties: { src: { type: "string" }, alt: { type: "string" } } },
        },
        required: ["title"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_custom_collection",
      title: "Update Custom Collection",
      description: "Update a custom collection's title, description, image, sort order, or publication status.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
          title: { type: "string" },
          body_html: { type: "string" },
          published: { type: "boolean" },
          sort_order: { type: "string" },
          image: { type: "object", properties: { src: { type: "string" }, alt: { type: "string" } } },
        },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_custom_collection",
      title: "Delete Custom Collection",
      description: "Permanently delete a custom collection. Products are not deleted, only the collection wrapper. Cannot be undone.",
      inputSchema: {
        type: "object",
        properties: { collection_id: { type: "string" } },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "list_collects",
      title: "List Collects (Product-Collection Associations)",
      description: "List product-collection membership records (collects). Filter by collection_id to see all products in a collection, or by product_id to see all collections a product belongs to.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
          product_id: { type: "string" },
          limit: { type: "number" },
          page_info: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_collect",
      title: "Add Product to Collection",
      description: "Add a product to a custom collection by creating a collect record. Returns the collect ID needed for removal.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
          product_id: { type: "string" },
          position: { type: "number" },
        },
        required: ["collection_id", "product_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_collect",
      title: "Remove Product from Collection",
      description: "Remove a product from a custom collection by deleting the collect record. Use list_collects to find the collect_id.",
      inputSchema: {
        type: "object",
        properties: { collect_id: { type: "string" } },
        required: ["collect_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_custom_collections: async (args) => {
      const params = ListCustomCollectionsSchema.parse(args);
      let result: { data: ShopifyCustomCollection[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_custom_collections", () =>
          client.paginateFromCursor<ShopifyCustomCollection>("/custom_collections.json", params.page_info!, params.limit)
        , { tool: "list_custom_collections" });
      } else {
        const extra: Record<string, string> = {};
        if (params.title) extra.title = params.title;
        if (params.product_id) extra.product_id = params.product_id;
        if (params.published_status && params.published_status !== "any") extra.published_status = params.published_status;
        result = await logger.time("tool.list_custom_collections", () =>
          client.paginatedGet<ShopifyCustomCollection>("/custom_collections.json", extra, params.limit)
        , { tool: "list_custom_collections" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_custom_collection: async (args) => {
      const { collection_id } = GetCustomCollectionSchema.parse(args);
      const data = await logger.time("tool.get_custom_collection", () =>
        client.get<{ custom_collection: ShopifyCustomCollection }>(`/custom_collections/${collection_id}.json`)
      , { tool: "get_custom_collection" });
      const col = (data as { custom_collection: ShopifyCustomCollection }).custom_collection;
      return { content: [{ type: "text", text: JSON.stringify(col, null, 2) }], structuredContent: col };
    },

    create_custom_collection: async (args) => {
      const params = CreateCustomCollectionSchema.parse(args);
      const data = await logger.time("tool.create_custom_collection", () =>
        client.post<{ custom_collection: ShopifyCustomCollection }>("/custom_collections.json", { custom_collection: params })
      , { tool: "create_custom_collection" });
      const col = (data as { custom_collection: ShopifyCustomCollection }).custom_collection;
      return { content: [{ type: "text", text: JSON.stringify(col, null, 2) }], structuredContent: col };
    },

    update_custom_collection: async (args) => {
      const { collection_id, ...updateData } = UpdateCustomCollectionSchema.parse(args);
      const data = await logger.time("tool.update_custom_collection", () =>
        client.put<{ custom_collection: ShopifyCustomCollection }>(`/custom_collections/${collection_id}.json`, { custom_collection: updateData })
      , { tool: "update_custom_collection" });
      const col = (data as { custom_collection: ShopifyCustomCollection }).custom_collection;
      return { content: [{ type: "text", text: JSON.stringify(col, null, 2) }], structuredContent: col };
    },

    delete_custom_collection: async (args) => {
      const { collection_id } = DeleteCustomCollectionSchema.parse(args);
      await logger.time("tool.delete_custom_collection", () =>
        client.delete<unknown>(`/custom_collections/${collection_id}.json`)
      , { tool: "delete_custom_collection" });
      const response = { success: true, collection_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    list_collects: async (args) => {
      const params = ListCollectsSchema.parse(args);
      let result: { data: ShopifyCollect[]; nextPageInfo?: string };
      const extra: Record<string, string> = {};
      if (params.collection_id) extra.collection_id = params.collection_id;
      if (params.product_id) extra.product_id = params.product_id;
      if (params.page_info) {
        result = await logger.time("tool.list_collects", () =>
          client.paginateFromCursor<ShopifyCollect>("/collects.json", params.page_info!, params.limit)
        , { tool: "list_collects" });
      } else {
        result = await logger.time("tool.list_collects", () =>
          client.paginatedGet<ShopifyCollect>("/collects.json", extra, params.limit)
        , { tool: "list_collects" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    create_collect: async (args) => {
      const params = CreateCollectSchema.parse(args);
      const data = await logger.time("tool.create_collect", () =>
        client.post<{ collect: ShopifyCollect }>("/collects.json", { collect: { collection_id: Number(params.collection_id), product_id: Number(params.product_id), ...(params.position ? { position: params.position } : {}) } })
      , { tool: "create_collect" });
      const collect = (data as { collect: ShopifyCollect }).collect;
      return { content: [{ type: "text", text: JSON.stringify(collect, null, 2) }], structuredContent: collect };
    },

    delete_collect: async (args) => {
      const { collect_id } = DeleteCollectSchema.parse(args);
      await logger.time("tool.delete_collect", () =>
        client.delete<unknown>(`/collects/${collect_id}.json`)
      , { tool: "delete_collect" });
      const response = { success: true, collect_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
