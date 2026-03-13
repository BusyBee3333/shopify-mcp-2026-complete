// Product Listings tools — Shopify Admin API 2024-01
// Covers: list_product_listings, get_product_listing, list_product_listing_ids,
//         create_product_listing, delete_product_listing

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyProductListing {
  product_id: number;
  created_at?: string;
  updated_at?: string;
  body_html?: string | null;
  handle?: string;
  images?: unknown[];
  title?: string;
  variants?: unknown[];
  vendor?: string;
  available?: boolean;
  tags?: string;
}

// === Zod Schemas ===
const ListProductListingsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  product_ids: z.string().optional().describe("Comma-separated product IDs to filter"),
  collection_id: z.string().optional().describe("Return products in this collection"),
  handle: z.string().optional(),
  updated_at_min: z.string().optional(),
});

const GetProductListingSchema = z.object({
  product_id: z.string().describe("Product ID"),
});

const ListProductListingIdsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(250),
  page_info: z.string().optional(),
});

const CreateProductListingSchema = z.object({
  product_id: z.string().describe("Product ID to publish to the sales channel"),
});

const DeleteProductListingSchema = z.object({
  product_id: z.string().describe("Product ID to remove from the sales channel"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_product_listings",
      title: "List Product Listings",
      description: "List products that have been published to a sales channel (Buy Button, Point of Sale, etc.). Product listings are products made available to a specific sales channel app.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          product_ids: { type: "string", description: "Comma-separated product IDs" },
          collection_id: { type: "string" },
          handle: { type: "string" },
          updated_at_min: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_product_listing",
      title: "Get Product Listing",
      description: "Get the listing details for a specific product on this sales channel.",
      inputSchema: {
        type: "object",
        properties: { product_id: { type: "string" } },
        required: ["product_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_product_listing_ids",
      title: "List Product Listing IDs",
      description: "Retrieve a lightweight list of only product IDs published to this sales channel. More efficient than list_product_listings when you only need IDs.",
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
      name: "create_product_listing",
      title: "Publish Product to Sales Channel",
      description: "Publish a product to this sales channel by creating a product listing. The product must already exist in the store.",
      inputSchema: {
        type: "object",
        properties: { product_id: { type: "string" } },
        required: ["product_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_product_listing",
      title: "Unpublish Product from Sales Channel",
      description: "Remove a product from this sales channel. The product is not deleted from the store, only unpublished from the channel.",
      inputSchema: {
        type: "object",
        properties: { product_id: { type: "string" } },
        required: ["product_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_product_listings: async (args) => {
      const params = ListProductListingsSchema.parse(args);
      let result: { data: ShopifyProductListing[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_product_listings", () =>
          client.paginateFromCursor<ShopifyProductListing>("/product_listings.json", params.page_info!, params.limit)
        , { tool: "list_product_listings" });
      } else {
        const extra: Record<string, string> = {};
        if (params.product_ids) extra.product_ids = params.product_ids;
        if (params.collection_id) extra.collection_id = params.collection_id;
        if (params.handle) extra.handle = params.handle;
        if (params.updated_at_min) extra.updated_at_min = params.updated_at_min;
        result = await logger.time("tool.list_product_listings", () =>
          client.paginatedGet<ShopifyProductListing>("/product_listings.json", extra, params.limit)
        , { tool: "list_product_listings" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_product_listing: async (args) => {
      const { product_id } = GetProductListingSchema.parse(args);
      const data = await logger.time("tool.get_product_listing", () =>
        client.get<{ product_listing: ShopifyProductListing }>(`/product_listings/${product_id}.json`)
      , { tool: "get_product_listing" });
      const listing = (data as { product_listing: ShopifyProductListing }).product_listing;
      return { content: [{ type: "text", text: JSON.stringify(listing, null, 2) }], structuredContent: listing };
    },

    list_product_listing_ids: async (args) => {
      const params = ListProductListingIdsSchema.parse(args);
      const qs = new URLSearchParams({ limit: String(params.limit) });
      if (params.page_info) qs.set("page_info", params.page_info);
      const data = await logger.time("tool.list_product_listing_ids", () =>
        client.get<{ product_ids: number[] }>(`/product_listings/product_ids.json?${qs}`)
      , { tool: "list_product_listing_ids" });
      const ids = (data as { product_ids: number[] }).product_ids;
      const response = { data: ids, meta: { count: ids.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    create_product_listing: async (args) => {
      const { product_id } = CreateProductListingSchema.parse(args);
      const data = await logger.time("tool.create_product_listing", () =>
        client.put<{ product_listing: ShopifyProductListing }>(`/product_listings/${product_id}.json`, { product_listing: { product_id: Number(product_id) } })
      , { tool: "create_product_listing" });
      const listing = (data as { product_listing: ShopifyProductListing }).product_listing;
      return { content: [{ type: "text", text: JSON.stringify(listing, null, 2) }], structuredContent: listing };
    },

    delete_product_listing: async (args) => {
      const { product_id } = DeleteProductListingSchema.parse(args);
      await logger.time("tool.delete_product_listing", () =>
        client.delete<unknown>(`/product_listings/${product_id}.json`)
      , { tool: "delete_product_listing" });
      const response = { success: true, product_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
