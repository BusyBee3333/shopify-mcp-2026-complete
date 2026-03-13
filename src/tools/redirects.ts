// Redirects tools — Shopify Admin API 2024-01
// Covers: list_redirects, get_redirect, create_redirect, update_redirect, delete_redirect

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyRedirect {
  id: number;
  path: string;
  target: string;
}

// === Zod Schemas ===
const ListRedirectsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  path: z.string().optional().describe("Filter by source path"),
  target: z.string().optional().describe("Filter by redirect target"),
});

const GetRedirectSchema = z.object({ redirect_id: z.string() });

const CreateRedirectSchema = z.object({
  path: z.string().describe("Source path (e.g. '/old-page')"),
  target: z.string().describe("Redirect target — can be relative ('/new-page') or absolute URL"),
});

const UpdateRedirectSchema = z.object({
  redirect_id: z.string(),
  path: z.string().optional(),
  target: z.string().optional(),
});

const DeleteRedirectSchema = z.object({ redirect_id: z.string() });

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_redirects",
      title: "List URL Redirects",
      description: "List all URL redirects configured in the store. Redirects send visitors from old paths to new destinations. Supports cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          path: { type: "string" },
          target: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_redirect",
      title: "Get URL Redirect",
      description: "Get a specific redirect by ID.",
      inputSchema: {
        type: "object",
        properties: { redirect_id: { type: "string" } },
        required: ["redirect_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_redirect",
      title: "Create URL Redirect",
      description: "Create a URL redirect. When visitors access the path, they are sent to the target. Useful for SEO when moving or renaming pages.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Source path (e.g. /old-url)" },
          target: { type: "string", description: "Redirect target (e.g. /new-url or full URL)" },
        },
        required: ["path", "target"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_redirect",
      title: "Update URL Redirect",
      description: "Update the source path or target of an existing URL redirect.",
      inputSchema: {
        type: "object",
        properties: {
          redirect_id: { type: "string" },
          path: { type: "string" },
          target: { type: "string" },
        },
        required: ["redirect_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_redirect",
      title: "Delete URL Redirect",
      description: "Permanently delete a URL redirect. Visitors will no longer be redirected from the path.",
      inputSchema: {
        type: "object",
        properties: { redirect_id: { type: "string" } },
        required: ["redirect_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_redirects: async (args) => {
      const params = ListRedirectsSchema.parse(args);
      let result: { data: ShopifyRedirect[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_redirects", () =>
          client.paginateFromCursor<ShopifyRedirect>("/redirects.json", params.page_info!, params.limit)
        , { tool: "list_redirects" });
      } else {
        const extra: Record<string, string> = {};
        if (params.path) extra.path = params.path;
        if (params.target) extra.target = params.target;
        result = await logger.time("tool.list_redirects", () =>
          client.paginatedGet<ShopifyRedirect>("/redirects.json", extra, params.limit)
        , { tool: "list_redirects" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_redirect: async (args) => {
      const { redirect_id } = GetRedirectSchema.parse(args);
      const data = await logger.time("tool.get_redirect", () =>
        client.get<{ redirect: ShopifyRedirect }>(`/redirects/${redirect_id}.json`)
      , { tool: "get_redirect" });
      const redirect = (data as { redirect: ShopifyRedirect }).redirect;
      return { content: [{ type: "text", text: JSON.stringify(redirect, null, 2) }], structuredContent: redirect };
    },

    create_redirect: async (args) => {
      const params = CreateRedirectSchema.parse(args);
      const data = await logger.time("tool.create_redirect", () =>
        client.post<{ redirect: ShopifyRedirect }>("/redirects.json", { redirect: params })
      , { tool: "create_redirect" });
      const redirect = (data as { redirect: ShopifyRedirect }).redirect;
      return { content: [{ type: "text", text: JSON.stringify(redirect, null, 2) }], structuredContent: redirect };
    },

    update_redirect: async (args) => {
      const { redirect_id, ...updateData } = UpdateRedirectSchema.parse(args);
      const data = await logger.time("tool.update_redirect", () =>
        client.put<{ redirect: ShopifyRedirect }>(`/redirects/${redirect_id}.json`, { redirect: updateData })
      , { tool: "update_redirect" });
      const redirect = (data as { redirect: ShopifyRedirect }).redirect;
      return { content: [{ type: "text", text: JSON.stringify(redirect, null, 2) }], structuredContent: redirect };
    },

    delete_redirect: async (args) => {
      const { redirect_id } = DeleteRedirectSchema.parse(args);
      await logger.time("tool.delete_redirect", () =>
        client.delete<unknown>(`/redirects/${redirect_id}.json`)
      , { tool: "delete_redirect" });
      const response = { success: true, redirect_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
