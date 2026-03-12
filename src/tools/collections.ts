// Collections tools — Shopify Admin API 2024-01
// Covers: list_collections, add_product_to_collection

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler, ShopifyCollection } from "../types.js";
import { logger } from "../logger.js";

// === Zod Schemas ===
const ListCollectionsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  type: z.enum(["custom", "smart", "all"]).optional().default("all").describe("Filter by collection type: custom (manual), smart (automated), or all"),
  title: z.string().optional().describe("Filter by collection title (partial match)"),
  page_info: z.string().optional().describe("Cursor for next page"),
});

const AddProductToCollectionSchema = z.object({
  product_id: z.string().describe("Shopify product ID to add"),
  collection_id: z.string().describe("Shopify custom collection ID (must be a manual/custom collection, not a smart collection)"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_collections",
      title: "List Collections",
      description:
        "List Shopify collections — both smart (automated) and custom (manual). Returns collection title, handle, and product count. Use type='custom' for manual collections (where you can add products), type='smart' for rule-based collections, or type='all' for both. Supports cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          type: { type: "string", enum: ["custom", "smart", "all"], description: "Collection type (default: all)" },
          title: { type: "string", description: "Filter by title (partial match)" },
          page_info: { type: "string", description: "Cursor for next page" },
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
                id: { type: "number" },
                title: { type: "string" },
                handle: { type: "string" },
                type: { type: "string" },
                published_at: { type: "string" },
              },
            },
          },
          meta: {
            type: "object",
            properties: {
              count: { type: "number" },
              hasMore: { type: "boolean" },
              nextPageInfo: { type: "string" },
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
      name: "add_product_to_collection",
      title: "Add Product to Collection",
      description:
        "Add a product to a custom (manual) Shopify collection by creating a collect record. Only works with custom collections — smart collections manage membership automatically via rules. Use list_collections with type='custom' first to find the collection ID.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Shopify product ID to add" },
          collection_id: { type: "string", description: "Shopify custom collection ID (must be manual, not smart)" },
        },
        required: ["product_id", "collection_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          product_id: { type: "number" },
          collection_id: { type: "number" },
          created_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_collections: async (args) => {
      const params = ListCollectionsSchema.parse(args);

      let customCollections: ShopifyCollection[] = [];
      let smartCollections: ShopifyCollection[] = [];
      let nextPageInfo: string | undefined;

      const extraParams: Record<string, string> = {};
      if (params.title) extraParams.title = params.title;

      if (params.type === "custom" || params.type === "all") {
        const result = await logger.time("tool.list_collections.custom", () =>
          params.page_info
            ? client.paginateFromCursor<ShopifyCollection>("/custom_collections.json", params.page_info!, params.limit)
            : client.paginatedGet<ShopifyCollection>("/custom_collections.json", extraParams, params.limit)
        , { tool: "list_collections", type: "custom" });

        customCollections = result.data.map((c) => ({ ...c, collection_type: "custom" }));
        if (!nextPageInfo) nextPageInfo = result.nextPageInfo;
      }

      if (params.type === "smart" || params.type === "all") {
        const result = await logger.time("tool.list_collections.smart", () =>
          params.page_info
            ? client.paginateFromCursor<ShopifyCollection>("/smart_collections.json", params.page_info!, params.limit)
            : client.paginatedGet<ShopifyCollection>("/smart_collections.json", extraParams, params.limit)
        , { tool: "list_collections", type: "smart" });

        smartCollections = result.data.map((c) => ({ ...c, collection_type: "smart" }));
        if (!nextPageInfo) nextPageInfo = result.nextPageInfo;
      }

      const allCollections = [...customCollections, ...smartCollections];

      const response = {
        data: allCollections,
        meta: {
          count: allCollections.length,
          hasMore: !!nextPageInfo,
          ...(nextPageInfo ? { nextPageInfo } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    add_product_to_collection: async (args) => {
      const params = AddProductToCollectionSchema.parse(args);

      // Shopify uses "collects" to link products to custom collections
      const data = await logger.time("tool.add_product_to_collection", () =>
        client.post<{ collect: { id: number; product_id: number; collection_id: number; created_at: string } }>(
          "/collects.json",
          {
            collect: {
              product_id: Number(params.product_id),
              collection_id: Number(params.collection_id),
            },
          }
        )
      , { tool: "add_product_to_collection" });

      const collect = (data as { collect: { id: number; product_id: number; collection_id: number; created_at: string } }).collect;

      return {
        content: [{ type: "text", text: JSON.stringify(collect, null, 2) }],
        structuredContent: collect,
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
