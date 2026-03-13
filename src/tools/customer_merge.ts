// Customer Merge tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: merge_customers, get_customer_merge_job, preview_customer_merge

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const PreviewCustomerMergeSchema = z.object({
  customerId: z.string().describe("GID of the customer to merge FROM (will be deleted)"),
  customerOneId: z.string().describe("GID of the customer to keep (merge INTO)"),
});

const MergeCustomersSchema = z.object({
  customerId: z.string().describe("GID of the customer to merge FROM (will be deleted after merge)"),
  customerOneId: z.string().describe("GID of the customer to keep (merge INTO — all orders/data merged here)"),
  overrides: z.object({
    firstName: z.string().optional().describe("First name to use in merged customer"),
    lastName: z.string().optional().describe("Last name to use in merged customer"),
    email: z.string().email().optional().describe("Email to use in merged customer"),
    phone: z.string().optional().describe("Phone to use in merged customer"),
    defaultAddressId: z.string().optional().describe("GID of the address to set as default"),
    note: z.string().optional().describe("Note for the merged customer"),
  }).optional().describe("Override specific fields in the resulting merged customer"),
});

const GetMergeJobSchema = z.object({
  jobId: z.string().describe("Customer merge job ID (from merge_customers response)"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "preview_customer_merge",
      title: "Preview Customer Merge",
      description: "Preview what a customer merge will look like without actually merging. Shows which customer data (orders, addresses, metafields) will be preserved and from which source customer.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "GID of customer to merge FROM (will be deleted)" },
          customerOneId: { type: "string", description: "GID of customer to merge INTO (will be kept)" },
        },
        required: ["customerId", "customerOneId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "merge_customers",
      title: "Merge Customers",
      description: "Merge two customer accounts into one. All orders, addresses, and history from the source customer will be moved to the destination customer. The source customer will be deleted. Returns a job ID to track progress.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Source customer GID (will be deleted)" },
          customerOneId: { type: "string", description: "Destination customer GID (will be kept)" },
          overrides: { type: "object", description: "Optional field overrides for the merged customer" },
        },
        required: ["customerId", "customerOneId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_customer_merge_job",
      title: "Get Customer Merge Job Status",
      description: "Get the status of an async customer merge job. Returns status (QUEUED/RUNNING/COMPLETED/FAILED) and the resulting merged customer ID on completion.",
      inputSchema: {
        type: "object",
        properties: { jobId: { type: "string", description: "Merge job ID" } },
        required: ["jobId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown> = {}) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    preview_customer_merge: async (args) => {
      const { customerId, customerOneId } = PreviewCustomerMergeSchema.parse(args);
      const q = `query customerMergePreview($customerId:ID!,$customerOneId:ID!){customerMergePreview(customerId:$customerId,customerOneId:$customerOneId){defaultFields{firstName{value source}lastName{value source}email{value source}phone{value source}}alternateFields{firstName{value source}lastName{value source}email{value source}phone{value source}}mergeErrors{field message}blockingFields}}`;
      const data = await logger.time("tool.preview_customer_merge", () =>
        gql(q, { customerId, customerOneId })
      , { tool: "preview_customer_merge" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    merge_customers: async (args) => {
      const { customerId, customerOneId, overrides } = MergeCustomersSchema.parse(args);
      const q = `mutation customerMerge($customerId:ID!,$customerOneId:ID!,$overrides:CustomerMergeOverrideFields){customerMerge(customerId:$customerId,customerOneId:$customerOneId,overrides:$overrides){job{id}resultingCustomerId userErrors{field message}}}`;
      const data = await logger.time("tool.merge_customers", () =>
        gql(q, { customerId, customerOneId, overrides })
      , { tool: "merge_customers" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_customer_merge_job: async (args) => {
      const { jobId } = GetMergeJobSchema.parse(args);
      const q = `query customerMergeJob($jobId:ID!){job(id:$jobId){id done query type}}`;
      const data = await logger.time("tool.get_customer_merge_job", () =>
        gql(q, { jobId })
      , { tool: "get_customer_merge_job" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
