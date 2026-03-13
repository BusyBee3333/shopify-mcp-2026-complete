// Metaobjects tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_metaobject_definitions, get_metaobject_definition, create_metaobject_definition,
//         list_metaobjects, get_metaobject, create_metaobject, update_metaobject, delete_metaobject
//
// Note: Shopify Metaobject Definitions and Metaobjects are available only via the GraphQL Admin API.
// This module calls /admin/api/2024-01/graphql.json through the existing ShopifyClient.

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface MetaobjectFieldDefinition {
  key: string;
  type: string;
  name?: string;
  description?: string | null;
  required?: boolean;
}

interface MetaobjectDefinition {
  id: string;
  type: string;
  name: string;
  description?: string | null;
  fieldDefinitions?: MetaobjectFieldDefinition[];
  createdAt?: string;
  updatedAt?: string;
}

interface MetaobjectField {
  key: string;
  value: string | null;
  type?: string;
}

interface Metaobject {
  id: string;
  type: string;
  handle?: string;
  displayName?: string;
  fields?: MetaobjectField[];
  updatedAt?: string;
  createdAt?: string;
}

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// === Zod Schemas ===
const ListMetaobjectDefinitionsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  after: z.string().optional().describe("GraphQL cursor for next page"),
});

const GetMetaobjectDefinitionSchema = z.object({
  type: z.string().describe("Metaobject definition type (e.g. 'my_custom_type')"),
});

const CreateMetaobjectDefinitionSchema = z.object({
  type: z.string().describe("Metaobject type key (lowercase, underscores; e.g. 'product_faq')"),
  name: z.string().describe("Human-readable name for the definition"),
  description: z.string().optional().describe("Optional description"),
  field_definitions: z.array(z.object({
    key: z.string().describe("Field key (e.g. 'question')"),
    type: z.string().describe("Field type (e.g. 'single_line_text_field', 'multi_line_text_field', 'url', 'boolean', 'number_integer', 'number_decimal', 'date', 'date_time', 'color', 'json', 'product_reference', 'file_reference')"),
    name: z.string().optional().describe("Human-readable field name"),
    description: z.string().optional().describe("Field description"),
    required: z.boolean().optional().describe("Whether field is required"),
  })).optional().describe("Field definitions for this metaobject type"),
});

const ListMetaobjectsSchema = z.object({
  type: z.string().describe("Metaobject type to list (e.g. 'my_custom_type')"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  after: z.string().optional().describe("GraphQL cursor for next page"),
});

const GetMetaobjectSchema = z.object({
  id: z.string().describe("Metaobject GID (e.g. 'gid://shopify/Metaobject/12345') or handle"),
});

const CreateMetaobjectSchema = z.object({
  type: z.string().describe("Metaobject type (must match an existing definition type)"),
  handle: z.string().optional().describe("Optional unique handle (auto-generated if omitted)"),
  fields: z.array(z.object({
    key: z.string().describe("Field key"),
    value: z.string().describe("Field value"),
  })).optional().describe("Field values for this metaobject instance"),
});

const UpdateMetaobjectSchema = z.object({
  id: z.string().describe("Metaobject GID (e.g. 'gid://shopify/Metaobject/12345')"),
  handle: z.string().optional().describe("Updated handle"),
  fields: z.array(z.object({
    key: z.string().describe("Field key"),
    value: z.string().describe("Field value"),
  })).optional().describe("Updated field values (only provided fields are changed)"),
});

const DeleteMetaobjectSchema = z.object({
  id: z.string().describe("Metaobject GID (e.g. 'gid://shopify/Metaobject/12345')"),
});

// === GraphQL Helper ===
async function gql<T>(
  client: ShopifyClient,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await client.post<GqlResponse<T>>("/graphql.json", { query, variables });
  const result = response as GqlResponse<T>;
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
  }
  if (!result.data) {
    throw new Error("GraphQL response missing data");
  }
  return result.data;
}

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_metaobject_definitions",
      title: "List Metaobject Definitions",
      description:
        "List all metaobject definitions on the Shopify store. Metaobject definitions describe custom content types (like FAQs, testimonials, team members) with typed fields. Returns type, name, description, and field definitions for each type. Uses GraphQL Admin API.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          after: { type: "string", description: "GraphQL cursor for next page" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" }, hasMore: { type: "boolean" }, endCursor: { type: "string" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_metaobject_definition",
      title: "Get Metaobject Definition",
      description:
        "Get a specific metaobject definition by type. Returns all field definitions with their types and validation rules. Use before creating metaobjects to understand the required fields.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Metaobject definition type (e.g. 'product_faq')" },
        },
        required: ["type"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" }, type: { type: "string" }, name: { type: "string" }, fieldDefinitions: { type: "array" },
        },
        required: ["id", "type"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_metaobject_definition",
      title: "Create Metaobject Definition",
      description:
        "Create a new metaobject definition (custom content type) on the Shopify store. Specify the type key, name, and field definitions with their types. Field types include: single_line_text_field, multi_line_text_field, url, boolean, number_integer, number_decimal, date, date_time, color, json, product_reference, file_reference.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Type key (lowercase, underscores, e.g. 'product_faq')" },
          name: { type: "string", description: "Human-readable name" },
          description: { type: "string", description: "Optional description" },
          field_definitions: {
            type: "array",
            description: "Field definitions",
            items: {
              type: "object",
              properties: {
                key: { type: "string" }, type: { type: "string" },
                name: { type: "string" }, required: { type: "boolean" },
              },
            },
          },
        },
        required: ["type", "name"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" }, type: { type: "string" }, name: { type: "string" },
        },
        required: ["id", "type"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "list_metaobjects",
      title: "List Metaobjects",
      description:
        "List all metaobject instances of a specific type. Returns the handle, display name, and all field values for each instance. Uses cursor-based pagination via GraphQL.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Metaobject type to list" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          after: { type: "string", description: "GraphQL cursor for next page" },
        },
        required: ["type"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" }, hasMore: { type: "boolean" }, endCursor: { type: "string" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_metaobject",
      title: "Get Metaobject",
      description:
        "Get a specific metaobject by its GID. Returns type, handle, display name, and all field values.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Metaobject GID (e.g. 'gid://shopify/Metaobject/12345')" },
        },
        required: ["id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" }, type: { type: "string" }, handle: { type: "string" }, fields: { type: "array" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_metaobject",
      title: "Create Metaobject",
      description:
        "Create a new metaobject instance of a specified type. Provide field key-value pairs matching the type's definition. Returns the created metaobject with its GID and handle.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Metaobject type (must match an existing definition)" },
          handle: { type: "string", description: "Optional unique handle (auto-generated if omitted)" },
          fields: {
            type: "array",
            description: "Field values",
            items: {
              type: "object",
              properties: { key: { type: "string" }, value: { type: "string" } },
            },
          },
        },
        required: ["type"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" }, type: { type: "string" }, handle: { type: "string" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_metaobject",
      title: "Update Metaobject",
      description:
        "Update an existing metaobject's field values or handle. Only the fields you provide will be updated. Returns the updated metaobject.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Metaobject GID" },
          handle: { type: "string", description: "Updated handle" },
          fields: {
            type: "array",
            description: "Updated field values",
            items: {
              type: "object",
              properties: { key: { type: "string" }, value: { type: "string" } },
            },
          },
        },
        required: ["id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" }, type: { type: "string" }, handle: { type: "string" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_metaobject",
      title: "Delete Metaobject",
      description:
        "Delete a metaobject instance by its GID. This action is irreversible. Use list_metaobjects to find the GID first.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Metaobject GID (e.g. 'gid://shopify/Metaobject/12345')" },
        },
        required: ["id"],
      },
      outputSchema: {
        type: "object",
        properties: { success: { type: "boolean" }, deleted_id: { type: "string" } },
        required: ["success"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_metaobject_definitions: async (args) => {
      const params = ListMetaobjectDefinitionsSchema.parse(args);

      const query = `
        query ListMetaobjectDefinitions($first: Int!, $after: String) {
          metaobjectDefinitions(first: $first, after: $after) {
            edges {
              node {
                id
                type
                name
                description
                fieldDefinitions {
                  key
                  type { name }
                  name
                  description
                  required
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      interface GqlListDefinitions {
        metaobjectDefinitions: {
          edges: Array<{ node: MetaobjectDefinition }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      }

      const result = await logger.time("tool.list_metaobject_definitions", () =>
        gql<GqlListDefinitions>(client, query, {
          first: Math.min(params.limit, 250),
          after: params.after || null,
        })
      , { tool: "list_metaobject_definitions" });

      const items = result.metaobjectDefinitions.edges.map((e) => e.node);
      const { hasNextPage, endCursor } = result.metaobjectDefinitions.pageInfo;

      const response = {
        data: items,
        meta: {
          count: items.length,
          hasMore: hasNextPage,
          ...(hasNextPage ? { endCursor } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_metaobject_definition: async (args) => {
      const { type } = GetMetaobjectDefinitionSchema.parse(args);

      const query = `
        query GetMetaobjectDefinition($type: String!) {
          metaobjectDefinitionByType(type: $type) {
            id
            type
            name
            description
            fieldDefinitions {
              key
              type { name }
              name
              description
              required
            }
          }
        }
      `;

      interface GqlGetDefinition {
        metaobjectDefinitionByType: MetaobjectDefinition | null;
      }

      const result = await logger.time("tool.get_metaobject_definition", () =>
        gql<GqlGetDefinition>(client, query, { type })
      , { tool: "get_metaobject_definition", type });

      const definition = result.metaobjectDefinitionByType;
      if (!definition) {
        throw new Error(`Metaobject definition with type '${type}' not found`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(definition, null, 2) }],
        structuredContent: definition,
      };
    },

    create_metaobject_definition: async (args) => {
      const params = CreateMetaobjectDefinitionSchema.parse(args);

      const mutation = `
        mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              id
              type
              name
              description
              fieldDefinitions {
                key
                type { name }
                name
                required
              }
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      const fieldDefinitions = (params.field_definitions || []).map((fd) => ({
        key: fd.key,
        type: fd.type,
        name: fd.name,
        description: fd.description,
        required: fd.required,
        validations: [],
      }));

      interface GqlCreateDefinition {
        metaobjectDefinitionCreate: {
          metaobjectDefinition: MetaobjectDefinition | null;
          userErrors: Array<{ field: string[]; message: string; code: string }>;
        };
      }

      const result = await logger.time("tool.create_metaobject_definition", () =>
        gql<GqlCreateDefinition>(client, mutation, {
          definition: {
            type: params.type,
            name: params.name,
            description: params.description,
            fieldDefinitions,
          },
        })
      , { tool: "create_metaobject_definition" });

      const { metaobjectDefinition, userErrors } = result.metaobjectDefinitionCreate;
      if (userErrors.length > 0) {
        throw new Error(`User errors: ${userErrors.map((e) => `${e.field}: ${e.message}`).join(", ")}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(metaobjectDefinition, null, 2) }],
        structuredContent: metaobjectDefinition as Record<string, unknown>,
      };
    },

    list_metaobjects: async (args) => {
      const params = ListMetaobjectsSchema.parse(args);

      const query = `
        query ListMetaobjects($type: String!, $first: Int!, $after: String) {
          metaobjects(type: $type, first: $first, after: $after) {
            edges {
              node {
                id
                type
                handle
                displayName
                fields {
                  key
                  value
                  type
                }
                updatedAt
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      interface GqlListMetaobjects {
        metaobjects: {
          edges: Array<{ node: Metaobject }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      }

      const result = await logger.time("tool.list_metaobjects", () =>
        gql<GqlListMetaobjects>(client, query, {
          type: params.type,
          first: Math.min(params.limit, 250),
          after: params.after || null,
        })
      , { tool: "list_metaobjects" });

      const items = result.metaobjects.edges.map((e) => e.node);
      const { hasNextPage, endCursor } = result.metaobjects.pageInfo;

      const response = {
        data: items,
        meta: {
          count: items.length,
          hasMore: hasNextPage,
          ...(hasNextPage ? { endCursor } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_metaobject: async (args) => {
      const { id } = GetMetaobjectSchema.parse(args);

      const query = `
        query GetMetaobject($id: ID!) {
          metaobject(id: $id) {
            id
            type
            handle
            displayName
            fields {
              key
              value
              type
            }
            updatedAt
          }
        }
      `;

      interface GqlGetMetaobject {
        metaobject: Metaobject | null;
      }

      const result = await logger.time("tool.get_metaobject", () =>
        gql<GqlGetMetaobject>(client, query, { id })
      , { tool: "get_metaobject", id });

      const metaobject = result.metaobject;
      if (!metaobject) {
        throw new Error(`Metaobject with ID '${id}' not found`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(metaobject, null, 2) }],
        structuredContent: metaobject,
      };
    },

    create_metaobject: async (args) => {
      const params = CreateMetaobjectSchema.parse(args);

      const mutation = `
        mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject {
              id
              type
              handle
              displayName
              fields {
                key
                value
                type
              }
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      interface GqlCreateMetaobject {
        metaobjectCreate: {
          metaobject: Metaobject | null;
          userErrors: Array<{ field: string[]; message: string; code: string }>;
        };
      }

      const result = await logger.time("tool.create_metaobject", () =>
        gql<GqlCreateMetaobject>(client, mutation, {
          metaobject: {
            type: params.type,
            handle: params.handle,
            fields: params.fields,
          },
        })
      , { tool: "create_metaobject" });

      const { metaobject, userErrors } = result.metaobjectCreate;
      if (userErrors.length > 0) {
        throw new Error(`User errors: ${userErrors.map((e) => `${e.field}: ${e.message}`).join(", ")}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(metaobject, null, 2) }],
        structuredContent: metaobject as Record<string, unknown>,
      };
    },

    update_metaobject: async (args) => {
      const { id, ...updateParams } = UpdateMetaobjectSchema.parse(args);

      const mutation = `
        mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject {
              id
              type
              handle
              displayName
              fields {
                key
                value
                type
              }
              updatedAt
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      interface GqlUpdateMetaobject {
        metaobjectUpdate: {
          metaobject: Metaobject | null;
          userErrors: Array<{ field: string[]; message: string; code: string }>;
        };
      }

      const result = await logger.time("tool.update_metaobject", () =>
        gql<GqlUpdateMetaobject>(client, mutation, {
          id,
          metaobject: {
            handle: updateParams.handle,
            fields: updateParams.fields,
          },
        })
      , { tool: "update_metaobject", id });

      const { metaobject, userErrors } = result.metaobjectUpdate;
      if (userErrors.length > 0) {
        throw new Error(`User errors: ${userErrors.map((e) => `${e.field}: ${e.message}`).join(", ")}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(metaobject, null, 2) }],
        structuredContent: metaobject as Record<string, unknown>,
      };
    },

    delete_metaobject: async (args) => {
      const { id } = DeleteMetaobjectSchema.parse(args);

      const mutation = `
        mutation DeleteMetaobject($id: ID!) {
          metaobjectDelete(id: $id) {
            deletedId
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      interface GqlDeleteMetaobject {
        metaobjectDelete: {
          deletedId: string | null;
          userErrors: Array<{ field: string[]; message: string; code: string }>;
        };
      }

      const result = await logger.time("tool.delete_metaobject", () =>
        gql<GqlDeleteMetaobject>(client, mutation, { id })
      , { tool: "delete_metaobject", id });

      const { deletedId, userErrors } = result.metaobjectDelete;
      if (userErrors.length > 0) {
        throw new Error(`User errors: ${userErrors.map((e) => `${e.field}: ${e.message}`).join(", ")}`);
      }

      const response = { success: true, deleted_id: deletedId };

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
