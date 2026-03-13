// Catalogs tools — Shopify Admin API 2024-01 (GraphQL) — B2B
// Covers: list_catalogs, get_catalog, create_catalog, update_catalog, delete_catalog, publish_catalog, catalog_context_update

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListCatalogsSchema = z.object({
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
  type: z.enum(["APP", "COMPANY_LOCATION", "MARKET", "PUBLISHED"]).optional().describe("Filter by catalog type"),
});

const GetCatalogSchema = z.object({
  id: z.string().describe("Catalog GID"),
});

const CreateCatalogSchema = z.object({
  title: z.string().describe("Catalog title"),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional().default("ACTIVE"),
  priceListId: z.string().optional().describe("Price list GID to associate with this catalog"),
  publicationId: z.string().optional().describe("Publication GID to associate"),
  context: z.object({
    companyLocations: z.array(z.object({
      companyLocationId: z.string().describe("Company location GID"),
    })).optional().describe("B2B company locations this catalog applies to"),
    markets: z.array(z.object({
      marketId: z.string().describe("Market GID"),
    })).optional().describe("Markets this catalog applies to"),
  }).optional().describe("Context (who this catalog is for)"),
});

const UpdateCatalogSchema = z.object({
  id: z.string().describe("Catalog GID"),
  title: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  priceListId: z.string().optional(),
});

const DeleteCatalogSchema = z.object({
  id: z.string().describe("Catalog GID to delete"),
});

const ListPriceListsSchema = z.object({
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
});

const CreatePriceListSchema = z.object({
  name: z.string().describe("Price list name"),
  currency: z.string().describe("ISO currency code for prices in this list"),
  parent: z.object({
    priceListParentUpdateStrategy: z.enum(["FIXED", "PERCENTAGE"]).describe("How prices are derived from the parent"),
    adjustment: z.object({
      type: z.enum(["PERCENTAGE_DECREASE", "PERCENTAGE_INCREASE"]).describe("Adjustment type"),
      value: z.number().describe("Adjustment percentage value"),
    }).optional().describe("Price adjustment from parent (used for PERCENTAGE strategy)"),
  }).optional().describe("Parent price list (store catalog) to base prices on"),
  fixedPricesAddOrUpdate: z.array(z.object({
    variantId: z.string().describe("Variant GID"),
    price: z.object({
      amount: z.string().describe("Price amount"),
      currencyCode: z.string().describe("Currency code"),
    }),
    compareAtPrice: z.object({
      amount: z.string().describe("Compare-at price"),
      currencyCode: z.string().describe("Currency code"),
    }).optional(),
  })).optional().describe("Fixed prices for specific variants"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_catalogs",
      title: "List Catalogs (B2B)",
      description: "List B2B catalogs on the store. Catalogs control which products and prices are visible to specific company locations or markets. Returns catalog GIDs, titles, status, and associated price lists.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
          type: { type: "string", enum: ["APP", "COMPANY_LOCATION", "MARKET", "PUBLISHED"], description: "Catalog type filter" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_catalog",
      title: "Get Catalog (B2B)",
      description: "Get a specific B2B catalog by GID. Returns title, status, associated price list, company location contexts, and product publications.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Catalog GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_catalog",
      title: "Create Catalog (B2B)",
      description: "Create a B2B catalog with a title, optional price list, and context (company locations or markets). Catalogs enable custom product visibility and pricing per buyer segment.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Catalog title" },
          status: { type: "string", enum: ["ACTIVE", "ARCHIVED"], description: "Status" },
          priceListId: { type: "string", description: "Price list GID" },
          publicationId: { type: "string", description: "Publication GID" },
          context: { type: "object", description: "Context (company locations or markets)" },
        },
        required: ["title"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_catalog",
      title: "Update Catalog (B2B)",
      description: "Update a catalog title, status, or associated price list.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Catalog GID" },
          title: { type: "string", description: "New title" },
          status: { type: "string", enum: ["ACTIVE", "ARCHIVED"], description: "New status" },
          priceListId: { type: "string", description: "New price list GID" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_catalog",
      title: "Delete Catalog (B2B)",
      description: "Delete a B2B catalog. Company locations assigned to this catalog will lose custom pricing.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Catalog GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_price_lists",
      title: "List Price Lists",
      description: "List all price lists on the store. Price lists define custom pricing for B2B catalogs — either percentage adjustments off the base price or fixed per-variant prices.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_price_list",
      title: "Create Price List",
      description: "Create a price list for B2B custom pricing. Use parent adjustment for percentage discounts off the base price, or specify fixed prices per variant. Associate with a catalog to apply to B2B buyers.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Price list name" },
          currency: { type: "string", description: "ISO currency code" },
          parent: { type: "object", description: "Parent price list settings (adjustment strategy)" },
          fixedPricesAddOrUpdate: { type: "array", description: "Fixed prices per variant" },
        },
        required: ["name", "currency"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown>) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    list_catalogs: async (args) => {
      const { first, after, type } = ListCatalogsSchema.parse(args);
      const q = `query($first:Int!,$after:String,$type:CatalogType){catalogs(first:$first,after:$after,type:$type){edges{node{id title status ... on CompanyLocationCatalog{companyLocations(first:3){edges{node{id name}}}}}}pageInfo{hasNextPage endCursor}}}`;
      const data = await logger.time("tool.list_catalogs", () => gql(q, { first, after, type }), { tool: "list_catalogs" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    get_catalog: async (args) => {
      const { id } = GetCatalogSchema.parse(args);
      const q = `query($id:ID!){catalog(id:$id){id title status priceList{id name}... on CompanyLocationCatalog{companyLocations(first:10){edges{node{id name company{id name}}}}}}}`;
      const data = await logger.time("tool.get_catalog", () => gql(q, { id }), { tool: "get_catalog" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    create_catalog: async (args) => {
      const params = CreateCatalogSchema.parse(args);
      const q = `mutation catalogCreate($input:CatalogCreateInput!){catalogCreate(input:$input){catalog{id title status}userErrors{field message}}}`;
      const data = await logger.time("tool.create_catalog", () => gql(q, { input: params }), { tool: "create_catalog" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    update_catalog: async (args) => {
      const { id, ...input } = UpdateCatalogSchema.parse(args);
      const q = `mutation catalogUpdate($id:ID!,$input:CatalogUpdateInput!){catalogUpdate(id:$id,input:$input){catalog{id title status}userErrors{field message}}}`;
      const data = await logger.time("tool.update_catalog", () => gql(q, { id, input }), { tool: "update_catalog" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    delete_catalog: async (args) => {
      const { id } = DeleteCatalogSchema.parse(args);
      const q = `mutation catalogDelete($id:ID!){catalogDelete(id:$id){deletedId userErrors{field message}}}`;
      const data = await logger.time("tool.delete_catalog", () => gql(q, { id }), { tool: "delete_catalog" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    list_price_lists: async (args) => {
      const { first, after } = ListPriceListsSchema.parse(args);
      const q = `query($first:Int!,$after:String){priceLists(first:$first,after:$after){edges{node{id name currency parent{adjustment{type value}priceListParentUpdateStrategy}fixedPricesCount}}pageInfo{hasNextPage endCursor}}}`;
      const data = await logger.time("tool.list_price_lists", () => gql(q, { first, after }), { tool: "list_price_lists" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    create_price_list: async (args) => {
      const { fixedPricesAddOrUpdate, ...input } = CreatePriceListSchema.parse(args);
      const q = `mutation priceListCreate($input:PriceListCreateInput!){priceListCreate(input:$input){priceList{id name currency}userErrors{field message}}}`;
      const data = await logger.time("tool.create_price_list", () => gql(q, { input: { ...input, fixedPricesAddOrUpdate } }), { tool: "create_price_list" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
