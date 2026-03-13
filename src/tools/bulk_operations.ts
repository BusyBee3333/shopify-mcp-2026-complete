// Bulk Operations tools — Shopify Admin GraphQL API 2024-01
// Covers: create_bulk_operation, get_bulk_operation, cancel_bulk_operation,
//         poll_bulk_operation (current running op)

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Zod Schemas ===
const CreateBulkOperationSchema = z.object({
  query: z.string().describe("GraphQL query to bulk-execute (must use bulkOperationRunQuery pattern)"),
});

const GetBulkOperationSchema = z.object({
  bulk_operation_id: z.string().describe("Bulk operation GID (e.g. gid://shopify/BulkOperation/123456)"),
});

const CancelBulkOperationSchema = z.object({
  bulk_operation_id: z.string(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "create_bulk_operation",
      title: "Create Bulk Operation",
      description: "Start a bulk operation using the Shopify Admin GraphQL API. Bulk operations allow you to query or mutate large amounts of data asynchronously. The operation runs in the background and results are available via a URL when complete. Monitor with get_bulk_operation or poll_current_bulk_operation.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "GraphQL mutation like: mutation { bulkOperationRunQuery(query: \"\"\"{products{edges{node{id title}}}}\"\"\") { bulkOperation { id status } userErrors { field message } } }",
          },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    {
      name: "get_bulk_operation",
      title: "Get Bulk Operation",
      description: "Get the status and result URL for a bulk operation by its GID. When status is COMPLETED, the url field contains a jsonl download link for the results.",
      inputSchema: {
        type: "object",
        properties: { bulk_operation_id: { type: "string" } },
        required: ["bulk_operation_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "poll_current_bulk_operation",
      title: "Poll Current Bulk Operation",
      description: "Get the status of the currently running bulk operation (if any). Useful for monitoring progress without needing to track the operation ID.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "cancel_bulk_operation",
      title: "Cancel Bulk Operation",
      description: "Cancel an in-progress bulk operation.",
      inputSchema: {
        type: "object",
        properties: { bulk_operation_id: { type: "string" } },
        required: ["bulk_operation_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === GraphQL helpers ===
const GET_BULK_OP_QUERY = (id: string) => `{
  node(id: "${id}") {
    ... on BulkOperation {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
}`;

const POLL_CURRENT_BULK_OP = `{
  currentBulkOperation {
    id
    status
    errorCode
    createdAt
    completedAt
    objectCount
    fileSize
    url
    partialDataUrl
  }
}`;

const CANCEL_BULK_OP = (id: string) => `mutation {
  bulkOperationCancel(id: "${id}") {
    bulkOperation { id status }
    userErrors { field message }
  }
}`;

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    create_bulk_operation: async (args) => {
      const { query } = CreateBulkOperationSchema.parse(args);
      const data = await logger.time("tool.create_bulk_operation", () =>
        client.post<unknown>("/graphql.json", { query })
      , { tool: "create_bulk_operation" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_bulk_operation: async (args) => {
      const { bulk_operation_id } = GetBulkOperationSchema.parse(args);
      const data = await logger.time("tool.get_bulk_operation", () =>
        client.post<unknown>("/graphql.json", { query: GET_BULK_OP_QUERY(bulk_operation_id) })
      , { tool: "get_bulk_operation" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    poll_current_bulk_operation: async (_args) => {
      const data = await logger.time("tool.poll_current_bulk_operation", () =>
        client.post<unknown>("/graphql.json", { query: POLL_CURRENT_BULK_OP })
      , { tool: "poll_current_bulk_operation" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    cancel_bulk_operation: async (args) => {
      const { bulk_operation_id } = CancelBulkOperationSchema.parse(args);
      const data = await logger.time("tool.cancel_bulk_operation", () =>
        client.post<unknown>("/graphql.json", { query: CANCEL_BULK_OP(bulk_operation_id) })
      , { tool: "cancel_bulk_operation" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
