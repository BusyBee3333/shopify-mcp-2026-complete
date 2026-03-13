// Metafields tools — Shopify Admin API 2024-01
// Covers: list_metafields, create_metafield, update_metafield, delete_metafield

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyMetafield {
  id?: number;
  namespace?: string;
  key?: string;
  value?: string | number | boolean;
  type?: string;
  description?: string | null;
  owner_id?: number;
  owner_resource?: string;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const resourceSchema = z.enum([
  "shop", "product", "variant", "order", "customer",
  "collection", "draft_order", "blog", "article", "page",
]).describe("Resource type that owns the metafield");

const ListMetafieldsSchema = z.object({
  owner_resource: resourceSchema,
  owner_id: z.string().optional().describe("Resource ID (required for all resources except 'shop')"),
  namespace: z.string().optional().describe("Filter by metafield namespace"),
  key: z.string().optional().describe("Filter by metafield key"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
});

const CreateMetafieldSchema = z.object({
  owner_resource: resourceSchema,
  owner_id: z.string().optional().describe("Resource ID (required for all except 'shop')"),
  namespace: z.string().describe("Metafield namespace (e.g. 'custom', 'my_app')"),
  key: z.string().describe("Metafield key (unique within namespace+resource)"),
  value: z.string().describe("Metafield value (always pass as string; Shopify casts by type)"),
  type: z.enum([
    "string", "integer", "json_string", "boolean",
    "color", "date", "date_time", "url", "dimension",
    "volume", "weight", "rating", "single_line_text_field",
    "multi_line_text_field", "rich_text_field", "number_decimal",
    "number_integer", "money", "file_reference", "product_reference",
    "variant_reference", "page_reference", "collection_reference",
  ]).describe("Metafield value type"),
  description: z.string().optional().describe("Optional description of the metafield"),
});

const UpdateMetafieldSchema = z.object({
  metafield_id: z.string().describe("Metafield ID to update"),
  owner_resource: resourceSchema,
  owner_id: z.string().optional().describe("Resource ID (required for all except 'shop')"),
  value: z.string().describe("New metafield value"),
  type: z.enum([
    "string", "integer", "json_string", "boolean",
    "color", "date", "date_time", "url", "dimension",
    "volume", "weight", "rating", "single_line_text_field",
    "multi_line_text_field", "rich_text_field", "number_decimal",
    "number_integer", "money", "file_reference", "product_reference",
    "variant_reference", "page_reference", "collection_reference",
  ]).optional().describe("Metafield value type"),
});

const DeleteMetafieldSchema = z.object({
  metafield_id: z.string().describe("Metafield ID to delete"),
  owner_resource: resourceSchema,
  owner_id: z.string().optional().describe("Resource ID (required for all except 'shop')"),
});

// Helper: build endpoint based on resource
function buildMetafieldEndpoint(ownerResource: string, ownerId?: string): string {
  if (ownerResource === "shop") {
    return "/metafields.json";
  }
  const resourceMap: Record<string, string> = {
    product: "products",
    variant: "variants",
    order: "orders",
    customer: "customers",
    collection: "collections",
    draft_order: "draft_orders",
    blog: "blogs",
    article: "articles",
    page: "pages",
  };
  const plural = resourceMap[ownerResource] || `${ownerResource}s`;
  return `/${plural}/${ownerId}/metafields.json`;
}

function buildMetafieldItemEndpoint(ownerResource: string, ownerId: string | undefined, metafieldId: string): string {
  if (ownerResource === "shop") {
    return `/metafields/${metafieldId}.json`;
  }
  const resourceMap: Record<string, string> = {
    product: "products",
    variant: "variants",
    order: "orders",
    customer: "customers",
    collection: "collections",
    draft_order: "draft_orders",
    blog: "blogs",
    article: "articles",
    page: "pages",
  };
  const plural = resourceMap[ownerResource] || `${ownerResource}s`;
  return `/${plural}/${ownerId}/metafields/${metafieldId}.json`;
}

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_metafields",
      title: "List Metafields",
      description:
        "List metafields for a Shopify resource (product, order, customer, shop, etc.). Metafields store custom data attached to resources. Supports filtering by namespace and key. Use owner_resource='shop' to get shop-level metafields.",
      inputSchema: {
        type: "object",
        properties: {
          owner_resource: {
            type: "string",
            enum: ["shop", "product", "variant", "order", "customer", "collection", "draft_order", "blog", "article", "page"],
            description: "Resource type",
          },
          owner_id: { type: "string", description: "Resource ID (required for all except 'shop')" },
          namespace: { type: "string", description: "Filter by namespace" },
          key: { type: "string", description: "Filter by key" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
        required: ["owner_resource"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" }, hasMore: { type: "boolean" } } },
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
      name: "create_metafield",
      title: "Create Metafield",
      description:
        "Create a new metafield on a Shopify resource. Metafields store arbitrary custom data (text, JSON, numbers, dates, etc.) attached to products, orders, customers, or other resources.",
      inputSchema: {
        type: "object",
        properties: {
          owner_resource: {
            type: "string",
            enum: ["shop", "product", "variant", "order", "customer", "collection", "draft_order", "blog", "article", "page"],
            description: "Resource type",
          },
          owner_id: { type: "string", description: "Resource ID" },
          namespace: { type: "string", description: "Namespace (e.g. 'custom')" },
          key: { type: "string", description: "Key name" },
          value: { type: "string", description: "Value (as string)" },
          type: { type: "string", description: "Value type (string, integer, json_string, boolean, etc.)" },
          description: { type: "string", description: "Optional description" },
        },
        required: ["owner_resource", "namespace", "key", "value", "type"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          namespace: { type: "string" },
          key: { type: "string" },
          value: { type: "string" },
          type: { type: "string" },
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
    {
      name: "update_metafield",
      title: "Update Metafield",
      description:
        "Update the value (and optionally type) of an existing Shopify metafield by its ID. Use list_metafields to find the metafield ID first.",
      inputSchema: {
        type: "object",
        properties: {
          metafield_id: { type: "string", description: "Metafield ID to update" },
          owner_resource: {
            type: "string",
            enum: ["shop", "product", "variant", "order", "customer", "collection", "draft_order", "blog", "article", "page"],
            description: "Resource type",
          },
          owner_id: { type: "string", description: "Resource ID (required for all except 'shop')" },
          value: { type: "string", description: "New value" },
          type: { type: "string", description: "Value type" },
        },
        required: ["metafield_id", "owner_resource", "value"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          value: { type: "string" },
          updated_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "delete_metafield",
      title: "Delete Metafield",
      description:
        "Permanently delete a Shopify metafield by ID. This cannot be undone. Use list_metafields to find the metafield ID first.",
      inputSchema: {
        type: "object",
        properties: {
          metafield_id: { type: "string", description: "Metafield ID to delete" },
          owner_resource: {
            type: "string",
            enum: ["shop", "product", "variant", "order", "customer", "collection", "draft_order", "blog", "article", "page"],
            description: "Resource type",
          },
          owner_id: { type: "string", description: "Resource ID (required for all except 'shop')" },
        },
        required: ["metafield_id", "owner_resource"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          metafield_id: { type: "string" },
        },
        required: ["success"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_metafields: async (args) => {
      const params = ListMetafieldsSchema.parse(args);
      const endpoint = buildMetafieldEndpoint(params.owner_resource, params.owner_id);

      const extraParams: Record<string, string> = {};
      if (params.namespace) extraParams.namespace = params.namespace;
      if (params.key) extraParams.key = params.key;

      let result: { data: ShopifyMetafield[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_metafields", () =>
          client.paginateFromCursor<ShopifyMetafield>(endpoint, params.page_info!, params.limit)
        , { tool: "list_metafields" });
      } else {
        result = await logger.time("tool.list_metafields", () =>
          client.paginatedGet<ShopifyMetafield>(endpoint, extraParams, params.limit)
        , { tool: "list_metafields" });
      }

      const response = {
        data: result.data,
        meta: {
          count: result.data.length,
          hasMore: !!result.nextPageInfo,
          ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    create_metafield: async (args) => {
      const { owner_resource, owner_id, ...metafieldData } = CreateMetafieldSchema.parse(args);
      const endpoint = buildMetafieldEndpoint(owner_resource, owner_id);

      const data = await logger.time("tool.create_metafield", () =>
        client.post<{ metafield: ShopifyMetafield }>(endpoint, { metafield: metafieldData })
      , { tool: "create_metafield" });

      const metafield = (data as { metafield: ShopifyMetafield }).metafield;

      return {
        content: [{ type: "text", text: JSON.stringify(metafield, null, 2) }],
        structuredContent: metafield,
      };
    },

    update_metafield: async (args) => {
      const { metafield_id, owner_resource, owner_id, ...updateData } = UpdateMetafieldSchema.parse(args);
      const endpoint = buildMetafieldItemEndpoint(owner_resource, owner_id, metafield_id);

      const data = await logger.time("tool.update_metafield", () =>
        client.put<{ metafield: ShopifyMetafield }>(endpoint, { metafield: updateData })
      , { tool: "update_metafield", metafield_id });

      const metafield = (data as { metafield: ShopifyMetafield }).metafield;

      return {
        content: [{ type: "text", text: JSON.stringify(metafield, null, 2) }],
        structuredContent: metafield,
      };
    },

    delete_metafield: async (args) => {
      const { metafield_id, owner_resource, owner_id } = DeleteMetafieldSchema.parse(args);
      const endpoint = buildMetafieldItemEndpoint(owner_resource, owner_id, metafield_id);

      await logger.time("tool.delete_metafield", () =>
        client.delete<unknown>(endpoint)
      , { tool: "delete_metafield", metafield_id });

      const response = { success: true, metafield_id };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
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
