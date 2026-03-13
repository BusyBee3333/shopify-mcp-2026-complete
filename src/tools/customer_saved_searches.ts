// Customer Saved Searches tools — Shopify Admin API 2024-01
// Covers: list_customer_saved_searches, get_customer_saved_search, create_customer_saved_search,
//         update_customer_saved_search, delete_customer_saved_search, search_customers_by_saved_search

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyCustomerSavedSearch {
  id: number;
  name: string;
  query?: string;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListCustomerSavedSearchesSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  since_id: z.string().optional(),
  page_info: z.string().optional(),
});

const GetCustomerSavedSearchSchema = z.object({ saved_search_id: z.string() });

const CreateCustomerSavedSearchSchema = z.object({
  name: z.string().describe("Name for this saved search segment"),
  query: z.string().describe("Shopify customer search query (e.g. 'accepts_marketing:true orders_count:>5 total_spent:>100')"),
});

const UpdateCustomerSavedSearchSchema = z.object({
  saved_search_id: z.string(),
  name: z.string().optional(),
  query: z.string().optional(),
});

const DeleteCustomerSavedSearchSchema = z.object({ saved_search_id: z.string() });

const GetCustomersFromSavedSearchSchema = z.object({
  saved_search_id: z.string(),
  limit: z.number().min(1).max(250).optional().default(50),
  order: z.string().optional().describe("Sort order (e.g. 'last_order_date DESC')"),
  page_info: z.string().optional(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_customer_saved_searches",
      title: "List Customer Saved Searches",
      description: "List all saved customer search segments. Saved searches let you quickly filter customers by criteria like marketing acceptance, spend, or purchase history.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          since_id: { type: "string" },
          page_info: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_customer_saved_search",
      title: "Get Customer Saved Search",
      description: "Get a specific saved customer search by ID, including its query string.",
      inputSchema: {
        type: "object",
        properties: { saved_search_id: { type: "string" } },
        required: ["saved_search_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_customer_saved_search",
      title: "Create Customer Saved Search",
      description: "Create a named customer search segment. The query uses Shopify customer search syntax. Example queries: 'accepts_marketing:true', 'total_spent:>1000', 'orders_count:>3 country:US'.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          query: { type: "string", description: "Customer search query" },
        },
        required: ["name", "query"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_customer_saved_search",
      title: "Update Customer Saved Search",
      description: "Update the name or query of an existing customer saved search.",
      inputSchema: {
        type: "object",
        properties: {
          saved_search_id: { type: "string" },
          name: { type: "string" },
          query: { type: "string" },
        },
        required: ["saved_search_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_customer_saved_search",
      title: "Delete Customer Saved Search",
      description: "Permanently delete a customer saved search segment.",
      inputSchema: {
        type: "object",
        properties: { saved_search_id: { type: "string" } },
        required: ["saved_search_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_customers_from_saved_search",
      title: "Get Customers from Saved Search",
      description: "Retrieve customers matching a saved search segment. Returns paginated customer records.",
      inputSchema: {
        type: "object",
        properties: {
          saved_search_id: { type: "string" },
          limit: { type: "number" },
          order: { type: "string" },
          page_info: { type: "string" },
        },
        required: ["saved_search_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_customer_saved_searches: async (args) => {
      const params = ListCustomerSavedSearchesSchema.parse(args);
      let result: { data: ShopifyCustomerSavedSearch[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_customer_saved_searches", () =>
          client.paginateFromCursor<ShopifyCustomerSavedSearch>("/customer_saved_searches.json", params.page_info!, params.limit)
        , { tool: "list_customer_saved_searches" });
      } else {
        const extra: Record<string, string> = {};
        if (params.since_id) extra.since_id = params.since_id;
        result = await logger.time("tool.list_customer_saved_searches", () =>
          client.paginatedGet<ShopifyCustomerSavedSearch>("/customer_saved_searches.json", extra, params.limit)
        , { tool: "list_customer_saved_searches" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_customer_saved_search: async (args) => {
      const { saved_search_id } = GetCustomerSavedSearchSchema.parse(args);
      const data = await logger.time("tool.get_customer_saved_search", () =>
        client.get<{ customer_saved_search: ShopifyCustomerSavedSearch }>(`/customer_saved_searches/${saved_search_id}.json`)
      , { tool: "get_customer_saved_search" });
      const search = (data as { customer_saved_search: ShopifyCustomerSavedSearch }).customer_saved_search;
      return { content: [{ type: "text", text: JSON.stringify(search, null, 2) }], structuredContent: search };
    },

    create_customer_saved_search: async (args) => {
      const params = CreateCustomerSavedSearchSchema.parse(args);
      const data = await logger.time("tool.create_customer_saved_search", () =>
        client.post<{ customer_saved_search: ShopifyCustomerSavedSearch }>("/customer_saved_searches.json", { customer_saved_search: params })
      , { tool: "create_customer_saved_search" });
      const search = (data as { customer_saved_search: ShopifyCustomerSavedSearch }).customer_saved_search;
      return { content: [{ type: "text", text: JSON.stringify(search, null, 2) }], structuredContent: search };
    },

    update_customer_saved_search: async (args) => {
      const { saved_search_id, ...updateData } = UpdateCustomerSavedSearchSchema.parse(args);
      const data = await logger.time("tool.update_customer_saved_search", () =>
        client.put<{ customer_saved_search: ShopifyCustomerSavedSearch }>(`/customer_saved_searches/${saved_search_id}.json`, { customer_saved_search: updateData })
      , { tool: "update_customer_saved_search" });
      const search = (data as { customer_saved_search: ShopifyCustomerSavedSearch }).customer_saved_search;
      return { content: [{ type: "text", text: JSON.stringify(search, null, 2) }], structuredContent: search };
    },

    delete_customer_saved_search: async (args) => {
      const { saved_search_id } = DeleteCustomerSavedSearchSchema.parse(args);
      await logger.time("tool.delete_customer_saved_search", () =>
        client.delete<unknown>(`/customer_saved_searches/${saved_search_id}.json`)
      , { tool: "delete_customer_saved_search" });
      const response = { success: true, saved_search_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_customers_from_saved_search: async (args) => {
      const params = GetCustomersFromSavedSearchSchema.parse(args);
      let result: { data: unknown[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.get_customers_from_saved_search", () =>
          client.paginateFromCursor<unknown>(`/customer_saved_searches/${params.saved_search_id}/customers.json`, params.page_info!, params.limit)
        , { tool: "get_customers_from_saved_search" });
      } else {
        const extra: Record<string, string> = {};
        if (params.order) extra.order = params.order;
        result = await logger.time("tool.get_customers_from_saved_search", () =>
          client.paginatedGet<unknown>(`/customer_saved_searches/${params.saved_search_id}/customers.json`, extra, params.limit)
        , { tool: "get_customers_from_saved_search" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
