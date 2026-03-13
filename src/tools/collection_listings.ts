// Collection Listings tools — Shopify Admin API 2024-01
// Covers: list_collection_listings, get_collection_listing, list_collection_listing_ids,
//         create_collection_listing, delete_collection_listing

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyCollectionListing {
  collection_id: number;
  updated_at?: string;
  body_html?: string | null;
  default_product_image?: unknown | null;
  handle?: string;
  image?: unknown | null;
  title?: string;
  sort_order?: string;
  published_at?: string;
}

// === Zod Schemas ===
const ListCollectionListingsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
});

const GetCollectionListingSchema = z.object({
  collection_id: z.string(),
});

const ListCollectionListingIdsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(250),
  page_info: z.string().optional(),
});

const CreateCollectionListingSchema = z.object({
  collection_id: z.string().describe("Collection ID to publish to the sales channel"),
});

const DeleteCollectionListingSchema = z.object({
  collection_id: z.string(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_collection_listings",
      title: "List Collection Listings",
      description: "List collections published to this sales channel. Collection listings make collections browsable for headless storefronts, mobile apps, and Buy Button.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_collection_listing",
      title: "Get Collection Listing",
      description: "Get the published listing for a specific collection on this sales channel.",
      inputSchema: {
        type: "object",
        properties: { collection_id: { type: "string" } },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_collection_listing_ids",
      title: "List Collection Listing IDs",
      description: "Retrieve a lightweight list of collection IDs published to this sales channel.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_collection_listing",
      title: "Publish Collection to Sales Channel",
      description: "Publish a collection to this sales channel by creating a collection listing.",
      inputSchema: {
        type: "object",
        properties: { collection_id: { type: "string" } },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_collection_listing",
      title: "Unpublish Collection from Sales Channel",
      description: "Remove a collection from this sales channel. The collection is not deleted from the store.",
      inputSchema: {
        type: "object",
        properties: { collection_id: { type: "string" } },
        required: ["collection_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_collection_listings: async (args) => {
      const params = ListCollectionListingsSchema.parse(args);
      let result: { data: ShopifyCollectionListing[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_collection_listings", () =>
          client.paginateFromCursor<ShopifyCollectionListing>("/collection_listings.json", params.page_info!, params.limit)
        , { tool: "list_collection_listings" });
      } else {
        result = await logger.time("tool.list_collection_listings", () =>
          client.paginatedGet<ShopifyCollectionListing>("/collection_listings.json", {}, params.limit)
        , { tool: "list_collection_listings" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_collection_listing: async (args) => {
      const { collection_id } = GetCollectionListingSchema.parse(args);
      const data = await logger.time("tool.get_collection_listing", () =>
        client.get<{ collection_listing: ShopifyCollectionListing }>(`/collection_listings/${collection_id}.json`)
      , { tool: "get_collection_listing" });
      const listing = (data as { collection_listing: ShopifyCollectionListing }).collection_listing;
      return { content: [{ type: "text", text: JSON.stringify(listing, null, 2) }], structuredContent: listing };
    },

    list_collection_listing_ids: async (args) => {
      const params = ListCollectionListingIdsSchema.parse(args);
      const qs = new URLSearchParams({ limit: String(params.limit) });
      if (params.page_info) qs.set("page_info", params.page_info);
      const data = await logger.time("tool.list_collection_listing_ids", () =>
        client.get<{ collection_ids: number[] }>(`/collection_listings/collection_ids.json?${qs}`)
      , { tool: "list_collection_listing_ids" });
      const ids = (data as { collection_ids: number[] }).collection_ids;
      const response = { data: ids, meta: { count: ids.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    create_collection_listing: async (args) => {
      const { collection_id } = CreateCollectionListingSchema.parse(args);
      const data = await logger.time("tool.create_collection_listing", () =>
        client.put<{ collection_listing: ShopifyCollectionListing }>(`/collection_listings/${collection_id}.json`, { collection_listing: { collection_id: Number(collection_id) } })
      , { tool: "create_collection_listing" });
      const listing = (data as { collection_listing: ShopifyCollectionListing }).collection_listing;
      return { content: [{ type: "text", text: JSON.stringify(listing, null, 2) }], structuredContent: listing };
    },

    delete_collection_listing: async (args) => {
      const { collection_id } = DeleteCollectionListingSchema.parse(args);
      await logger.time("tool.delete_collection_listing", () =>
        client.delete<unknown>(`/collection_listings/${collection_id}.json`)
      , { tool: "delete_collection_listing" });
      const response = { success: true, collection_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
