// Publications tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_publications, publish_resource, unpublish_resource, list_publishable_resources

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListPublicationsSchema = z.object({
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
});

const PublishResourceSchema = z.object({
  id: z.string().describe("Resource GID to publish (Product, Collection, Page, Blog, Article, etc.)"),
  input: z.array(z.object({
    publicationId: z.string().describe("Publication GID to publish to"),
    publishDate: z.string().optional().describe("Scheduled publish date (ISO 8601), null for immediate"),
  })).describe("Publications to add the resource to"),
});

const UnpublishResourceSchema = z.object({
  id: z.string().describe("Resource GID to unpublish"),
  input: z.array(z.object({
    publicationId: z.string().describe("Publication GID to unpublish from"),
  })).describe("Publications to remove the resource from"),
});

const ListPublishedResourcesSchema = z.object({
  publicationId: z.string().describe("Publication GID"),
  resourceType: z.enum(["PRODUCT", "COLLECTION", "PAGE", "BLOG", "ARTICLE"]).describe("Resource type to list"),
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_publications",
      title: "List Publications (Sales Channels)",
      description: "List all publications (sales channels) on the store such as Online Store, Point of Sale, Facebook, Instagram, etc. Returns publication GIDs and names. Use to find the publication ID before publishing products.",
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
      name: "publish_resource",
      title: "Publish Resource to Channels",
      description: "Publish a product, collection, page, blog, or article to one or more sales channels/publications. Optionally schedule future publish dates.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Resource GID (Product, Collection, Page, etc.)" },
          input: { type: "array", description: "Array of {publicationId, publishDate} objects" },
        },
        required: ["id", "input"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "unpublish_resource",
      title: "Unpublish Resource from Channels",
      description: "Remove a product, collection, page, or other resource from one or more sales channels.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Resource GID to unpublish" },
          input: { type: "array", description: "Array of {publicationId} objects" },
        },
        required: ["id", "input"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_published_resources",
      title: "List Published Resources",
      description: "List resources published to a specific channel/publication. Filter by resource type (PRODUCT, COLLECTION, PAGE, etc.) to see what's visible on a given sales channel.",
      inputSchema: {
        type: "object",
        properties: {
          publicationId: { type: "string", description: "Publication GID" },
          resourceType: { type: "string", enum: ["PRODUCT", "COLLECTION", "PAGE", "BLOG", "ARTICLE"], description: "Resource type" },
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
        },
        required: ["publicationId", "resourceType"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown> = {}) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    list_publications: async (args) => {
      const { first, after } = ListPublicationsSchema.parse(args);
      const q = `query($first:Int!,$after:String){publications(first:$first,after:$after){edges{node{id name autoPublish supportsFuturePublishing}}pageInfo{hasNextPage endCursor}}}`;
      const data = await logger.time("tool.list_publications", () => gql(q, { first, after }), { tool: "list_publications" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    publish_resource: async (args) => {
      const { id, input } = PublishResourceSchema.parse(args);
      const q = `mutation publishablePublish($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){publishable{... on Product{id title}}userErrors{field message}}}`;
      const data = await logger.time("tool.publish_resource", () => gql(q, { id, input }), { tool: "publish_resource" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    unpublish_resource: async (args) => {
      const { id, input } = UnpublishResourceSchema.parse(args);
      const q = `mutation publishableUnpublish($id:ID!,$input:[PublicationInput!]!){publishableUnpublish(id:$id,input:$input){publishable{... on Product{id title}}userErrors{field message}}}`;
      const data = await logger.time("tool.unpublish_resource", () => gql(q, { id, input }), { tool: "unpublish_resource" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    list_published_resources: async (args) => {
      const { publicationId, resourceType, first, after } = ListPublishedResourcesSchema.parse(args);
      const q = `query($publicationId:ID!,$first:Int!,$after:String){publication(id:$publicationId){publishedCollections:collectionPublicationsV3(first:$first,after:$after){edges{node{collection{id title}}}}id name}}`;
      // Generic approach via resourcePublications query
      const genericQ = `query($id:ID!,$first:Int!,$after:String){publication(id:$id){productPublicationsV3(first:$first,after:$after){edges{node{... on ProductPublication{product{id title}}}}}pageInfo{hasNextPage}}}`;
      const data = await logger.time("tool.list_published_resources", () =>
        gql(genericQ, { id: publicationId, first, after })
      , { tool: "list_published_resources" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
