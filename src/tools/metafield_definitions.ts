// Metafield Definitions tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_metafield_definitions, get_metafield_definition, create_metafield_definition, delete_metafield_definition, pin_metafield_definition, unpin_metafield_definition

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListMetafieldDefinitionsSchema = z.object({
  ownerType: z.enum([
    "PRODUCT", "PRODUCTVARIANT", "COLLECTION", "CUSTOMER",
    "ORDER", "DRAFTORDER", "BLOG", "PAGE", "ARTICLE", "SHOP",
    "LOCATION", "MARKET", "MEDIA_IMAGE", "DISCOUNT",
  ]).describe("Owner type to list definitions for"),
  first: z.number().min(1).max(250).optional().default(50).describe("Number of results"),
  after: z.string().optional().describe("Pagination cursor"),
  namespace: z.string().optional().describe("Filter by namespace"),
});

const GetMetafieldDefinitionSchema = z.object({
  id: z.string().describe("Metafield definition GID"),
});

const CreateMetafieldDefinitionSchema = z.object({
  name: z.string().describe("Human-readable definition name"),
  namespace: z.string().describe("Namespace for the metafield (e.g. my_app, custom)"),
  key: z.string().describe("Metafield key (e.g. care_guide, warranty)"),
  description: z.string().optional().describe("Description of what this metafield stores"),
  ownerType: z.enum([
    "PRODUCT", "PRODUCTVARIANT", "COLLECTION", "CUSTOMER",
    "ORDER", "DRAFTORDER", "BLOG", "PAGE", "ARTICLE", "SHOP",
    "LOCATION", "MARKET", "MEDIA_IMAGE",
  ]).describe("Resource type that owns this metafield"),
  type: z.string().describe("Metafield type (single_line_text_field, multi_line_text_field, number_integer, number_decimal, date, date_time, url, json, boolean, color, weight, dimension, volume, rating, file_reference, product_reference, variant_reference, collection_reference, page_reference, url, list.single_line_text_field, etc.)"),
  validations: z.array(z.object({
    name: z.string().describe("Validation name (e.g. min, max, regex, choices)"),
    value: z.string().describe("Validation value"),
  })).optional().describe("Validation rules for the metafield"),
  pin: z.boolean().optional().default(false).describe("Pin this definition to appear in the admin UI"),
  visibleToStorefrontApi: z.boolean().optional().default(false).describe("Make accessible via Storefront API"),
});

const DeleteMetafieldDefinitionSchema = z.object({
  id: z.string().describe("Metafield definition GID to delete"),
  deleteAllAssociatedMetafields: z.boolean().optional().default(false).describe("Also delete all metafields using this definition"),
});

const PinDefinitionSchema = z.object({
  definitionId: z.string().describe("Metafield definition GID to pin"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_metafield_definitions",
      title: "List Metafield Definitions",
      description: "List metafield definitions for a given owner type (PRODUCT, CUSTOMER, ORDER, etc.). Returns definition names, namespaces, keys, and types. Use to discover all metafield schemas on the store.",
      inputSchema: {
        type: "object",
        properties: {
          ownerType: {
            type: "string",
            enum: ["PRODUCT", "PRODUCTVARIANT", "COLLECTION", "CUSTOMER", "ORDER", "DRAFTORDER", "BLOG", "PAGE", "ARTICLE", "SHOP", "LOCATION"],
            description: "Owner type",
          },
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
          namespace: { type: "string", description: "Filter by namespace" },
        },
        required: ["ownerType"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_metafield_definition",
      title: "Get Metafield Definition",
      description: "Get a specific metafield definition by GID. Returns full schema including type, validations, and whether it's pinned in the admin.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Metafield definition GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_metafield_definition",
      title: "Create Metafield Definition",
      description: "Create a metafield definition schema that enforces a type and optional validations for metafields. Supports types: single_line_text_field, multi_line_text_field, number_integer, json, boolean, date, color, url, product_reference, file_reference, rating, and list variants.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Definition name" },
          namespace: { type: "string", description: "Namespace (e.g. custom, my_app)" },
          key: { type: "string", description: "Key (e.g. care_guide)" },
          description: { type: "string", description: "Description" },
          ownerType: { type: "string", description: "Owner resource type" },
          type: { type: "string", description: "Metafield value type" },
          validations: { type: "array", description: "Validation rules" },
          pin: { type: "boolean", description: "Pin to admin UI" },
          visibleToStorefrontApi: { type: "boolean", description: "Expose via Storefront API" },
        },
        required: ["name", "namespace", "key", "ownerType", "type"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_metafield_definition",
      title: "Delete Metafield Definition",
      description: "Delete a metafield definition. Optionally delete all associated metafields using this definition.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Metafield definition GID" },
          deleteAllAssociatedMetafields: { type: "boolean", description: "Also delete all metafields using this definition" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "pin_metafield_definition",
      title: "Pin Metafield Definition",
      description: "Pin a metafield definition to appear prominently in the Shopify admin interface for the resource type.",
      inputSchema: {
        type: "object",
        properties: { definitionId: { type: "string", description: "Metafield definition GID" } },
        required: ["definitionId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "unpin_metafield_definition",
      title: "Unpin Metafield Definition",
      description: "Unpin a previously pinned metafield definition from the admin interface.",
      inputSchema: {
        type: "object",
        properties: { definitionId: { type: "string", description: "Metafield definition GID" } },
        required: ["definitionId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_metafield_definitions: async (args) => {
      const { ownerType, first, after, namespace } = ListMetafieldDefinitionsSchema.parse(args);
      const query = `
        query getMetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int!, $after: String, $namespace: String) {
          metafieldDefinitions(ownerType: $ownerType, first: $first, after: $after, namespace: $namespace) {
            edges {
              node {
                id name namespace key description type { name }
                pinnedPosition
                visibleToStorefrontApi
                validations { name value }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await logger.time("tool.list_metafield_definitions", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { ownerType, first, after, namespace },
        })
      , { tool: "list_metafield_definitions" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_metafield_definition: async (args) => {
      const { id } = GetMetafieldDefinitionSchema.parse(args);
      const query = `
        query getMetafieldDefinition($id: ID!) {
          metafieldDefinition(id: $id) {
            id name namespace key description
            type { name }
            pinnedPosition
            validations { name value }
            visibleToStorefrontApi
            ownerType
            metafieldsCount
          }
        }
      `;
      const data = await logger.time("tool.get_metafield_definition", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id } })
      , { tool: "get_metafield_definition" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_metafield_definition: async (args) => {
      const params = CreateMetafieldDefinitionSchema.parse(args);
      const { pin, ...definition } = params;
      const query = `
        mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id name namespace key type { name } }
            userErrors { field message code }
          }
        }
      `;
      const data = await logger.time("tool.create_metafield_definition", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { definition } })
      , { tool: "create_metafield_definition" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    delete_metafield_definition: async (args) => {
      const { id, deleteAllAssociatedMetafields } = DeleteMetafieldDefinitionSchema.parse(args);
      const query = `
        mutation metafieldDefinitionDelete($id: ID!, $deleteAllAssociatedMetafields: Boolean) {
          metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: $deleteAllAssociatedMetafields) {
            deletedDefinitionId
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.delete_metafield_definition", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { id, deleteAllAssociatedMetafields },
        })
      , { tool: "delete_metafield_definition" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    pin_metafield_definition: async (args) => {
      const { definitionId } = PinDefinitionSchema.parse(args);
      const query = `
        mutation metafieldDefinitionPin($definitionId: ID!) {
          metafieldDefinitionPin(definitionId: $definitionId) {
            pinnedDefinition { id name pinnedPosition }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.pin_metafield_definition", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { definitionId } })
      , { tool: "pin_metafield_definition" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    unpin_metafield_definition: async (args) => {
      const { definitionId } = PinDefinitionSchema.parse(args);
      const query = `
        mutation metafieldDefinitionUnpin($definitionId: ID!) {
          metafieldDefinitionUnpin(definitionId: $definitionId) {
            unpinnedDefinition { id name }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.unpin_metafield_definition", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { definitionId } })
      , { tool: "unpin_metafield_definition" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
