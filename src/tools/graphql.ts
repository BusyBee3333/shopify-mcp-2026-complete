// GraphQL Admin API tools — Shopify Admin API 2024-01
// Covers: graphql_query — execute any Admin API GraphQL query or mutation

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Zod Schemas ===
const GraphQLQuerySchema = z.object({
  query: z.string().describe("GraphQL query or mutation string"),
  variables: z.record(z.unknown()).optional().describe("GraphQL variables as a JSON object"),
  operation_name: z.string().optional().describe("Operation name (if query has multiple operations)"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "graphql_query",
      title: "Execute GraphQL Admin API Query",
      description: "Execute any GraphQL query or mutation against the Shopify Admin API. This is the escape hatch for operations not covered by the REST tools. The Admin GraphQL API supports all Shopify resources with fine-grained field selection, bulk operations, and access to newer features like metaobject definitions, discounts automation, and more. Be mindful of query cost and pagination (use cursor-based pagination with pageInfo.hasNextPage and endCursor).",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "GraphQL query or mutation" },
          variables: { type: "object", description: "Query variables (JSON)" },
          operation_name: { type: "string", description: "Operation name if multiple operations in document" },
        },
        required: ["query"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    graphql_query: async (args) => {
      const { query, variables, operation_name } = GraphQLQuerySchema.parse(args);

      const body: Record<string, unknown> = { query };
      if (variables) body.variables = variables;
      if (operation_name) body.operationName = operation_name;

      const data = await logger.time("tool.graphql_query", () =>
        client.post<{ data?: unknown; errors?: unknown[] }>("/graphql.json", body)
      , { tool: "graphql_query" });

      const result = data as { data?: unknown; errors?: unknown[] };

      if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
        const errorMessage = `GraphQL errors: ${JSON.stringify(result.errors)}`;
        return {
          content: [{ type: "text", text: errorMessage }],
          structuredContent: { errors: result.errors, data: result.data ?? null },
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
