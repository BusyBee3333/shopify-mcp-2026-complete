// Pages tools — Shopify Admin API 2024-01
// Covers: list_pages, get_page, create_page, update_page, delete_page
// Online Store pages (About Us, FAQ, Contact, etc.)

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyPage {
  id?: number;
  title?: string;
  handle?: string;
  body_html?: string;
  author?: string;
  shop_id?: number;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  template_suffix?: string | null;
  metafield?: Record<string, unknown>;
  admin_graphql_api_id?: string;
}

// === Zod Schemas ===
const ListPagesSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
  title: z.string().optional().describe("Filter by page title (partial match)"),
  handle: z.string().optional().describe("Filter by page handle (URL slug)"),
  published_status: z.enum(["published", "unpublished", "any"]).optional().default("any").describe("Filter by publish status"),
  created_at_min: z.string().optional().describe("Filter pages created after ISO 8601 date"),
  created_at_max: z.string().optional().describe("Filter pages created before ISO 8601 date"),
  updated_at_min: z.string().optional().describe("Filter pages updated after ISO 8601 date"),
  updated_at_max: z.string().optional().describe("Filter pages updated before ISO 8601 date"),
});

const GetPageSchema = z.object({
  page_id: z.string().describe("Shopify page ID"),
});

const CreatePageSchema = z.object({
  title: z.string().describe("Page title (required)"),
  body_html: z.string().optional().describe("Page content as HTML"),
  handle: z.string().optional().describe("URL slug (auto-generated from title if omitted; e.g. 'about-us')"),
  author: z.string().optional().describe("Page author name"),
  published: z.boolean().optional().default(true).describe("Whether the page is published (default: true)"),
  template_suffix: z.string().optional().describe("Theme template suffix to use (e.g. 'contact' uses page.contact.liquid)"),
  metafields: z.array(z.object({
    key: z.string(),
    value: z.string(),
    type: z.string(),
    namespace: z.string(),
  })).optional().describe("Metafields to attach to the page"),
});

const UpdatePageSchema = z.object({
  page_id: z.string().describe("Shopify page ID"),
  title: z.string().optional().describe("Updated page title"),
  body_html: z.string().optional().describe("Updated page content (HTML)"),
  handle: z.string().optional().describe("Updated URL slug"),
  author: z.string().optional().describe("Updated author name"),
  published: z.boolean().optional().describe("Publish or unpublish the page"),
  template_suffix: z.string().optional().describe("Updated template suffix"),
});

const DeletePageSchema = z.object({
  page_id: z.string().describe("Shopify page ID to permanently delete"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_pages",
      title: "List Pages",
      description:
        "List all Online Store pages on the Shopify store (e.g. About Us, FAQ, Contact, Privacy Policy). Returns title, handle, published status, author, and body HTML. Supports filtering by title, handle, publish status, and date. Supports cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          title: { type: "string", description: "Filter by page title (partial match)" },
          handle: { type: "string", description: "Filter by URL slug" },
          published_status: { type: "string", enum: ["published", "unpublished", "any"], description: "Filter by publish status" },
          created_at_min: { type: "string", description: "Filter created after ISO 8601 date" },
          created_at_max: { type: "string", description: "Filter created before ISO 8601 date" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" }, hasMore: { type: "boolean" }, nextPageInfo: { type: "string" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_page",
      title: "Get Page",
      description:
        "Get full details for a specific Shopify Online Store page by ID. Returns title, handle (URL slug), full body HTML content, author, publish status, template suffix, and timestamps.",
      inputSchema: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Shopify page ID" },
        },
        required: ["page_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, title: { type: "string" }, handle: { type: "string" },
          body_html: { type: "string" }, published_at: { type: "string" }, author: { type: "string" },
        },
        required: ["id", "title"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_page",
      title: "Create Page",
      description:
        "Create a new Online Store page on Shopify. Supports HTML body content, custom URL handle, author, publish status, and theme template suffix. Use template_suffix to apply custom page templates (e.g. 'contact' for page.contact.liquid).",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Page title (required)" },
          body_html: { type: "string", description: "Page content as HTML" },
          handle: { type: "string", description: "URL slug (auto-generated if omitted)" },
          author: { type: "string", description: "Page author" },
          published: { type: "boolean", description: "Publish immediately (default: true)" },
          template_suffix: { type: "string", description: "Theme template suffix (e.g. 'contact', 'faq')" },
          metafields: { type: "array", description: "Metafields to attach", items: { type: "object" } },
        },
        required: ["title"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, title: { type: "string" }, handle: { type: "string" }, published_at: { type: "string" },
        },
        required: ["id", "title"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_page",
      title: "Update Page",
      description:
        "Update an existing Shopify Online Store page. Only fields provided will be updated. Use published=false to unpublish a page. Returns the updated page.",
      inputSchema: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Shopify page ID" },
          title: { type: "string", description: "Updated title" },
          body_html: { type: "string", description: "Updated HTML content" },
          handle: { type: "string", description: "Updated URL slug" },
          author: { type: "string", description: "Updated author" },
          published: { type: "boolean", description: "Publish or unpublish" },
          template_suffix: { type: "string", description: "Updated template suffix" },
        },
        required: ["page_id"],
      },
      outputSchema: {
        type: "object",
        properties: { id: { type: "number" }, title: { type: "string" }, updated_at: { type: "string" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_page",
      title: "Delete Page",
      description:
        "Permanently delete a Shopify Online Store page. This action cannot be undone. Verify the page ID with get_page before deleting.",
      inputSchema: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Shopify page ID to permanently delete" },
        },
        required: ["page_id"],
      },
      outputSchema: {
        type: "object",
        properties: { success: { type: "boolean" }, page_id: { type: "string" } },
        required: ["success"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_pages: async (args) => {
      const params = ListPagesSchema.parse(args);
      let result: { data: ShopifyPage[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_pages", () =>
          client.paginateFromCursor<ShopifyPage>("/pages.json", params.page_info!, params.limit)
        , { tool: "list_pages" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.title) extraParams.title = params.title;
        if (params.handle) extraParams.handle = params.handle;
        if (params.published_status) extraParams.published_status = params.published_status;
        if (params.created_at_min) extraParams.created_at_min = params.created_at_min;
        if (params.created_at_max) extraParams.created_at_max = params.created_at_max;
        if (params.updated_at_min) extraParams.updated_at_min = params.updated_at_min;
        if (params.updated_at_max) extraParams.updated_at_max = params.updated_at_max;

        result = await logger.time("tool.list_pages", () =>
          client.paginatedGet<ShopifyPage>("/pages.json", extraParams, params.limit)
        , { tool: "list_pages" });
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

    get_page: async (args) => {
      const { page_id } = GetPageSchema.parse(args);
      const data = await logger.time("tool.get_page", () =>
        client.get<{ page: ShopifyPage }>(`/pages/${page_id}.json`)
      , { tool: "get_page", page_id });

      const page = (data as { page: ShopifyPage }).page;

      return {
        content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
        structuredContent: page,
      };
    },

    create_page: async (args) => {
      const params = CreatePageSchema.parse(args);
      const data = await logger.time("tool.create_page", () =>
        client.post<{ page: ShopifyPage }>("/pages.json", { page: params })
      , { tool: "create_page" });

      const page = (data as { page: ShopifyPage }).page;

      return {
        content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
        structuredContent: page,
      };
    },

    update_page: async (args) => {
      const { page_id, ...updateData } = UpdatePageSchema.parse(args);
      const data = await logger.time("tool.update_page", () =>
        client.put<{ page: ShopifyPage }>(`/pages/${page_id}.json`, { page: updateData })
      , { tool: "update_page", page_id });

      const page = (data as { page: ShopifyPage }).page;

      return {
        content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
        structuredContent: page,
      };
    },

    delete_page: async (args) => {
      const { page_id } = DeletePageSchema.parse(args);
      await logger.time("tool.delete_page", () =>
        client.delete<unknown>(`/pages/${page_id}.json`)
      , { tool: "delete_page", page_id });

      const response = { success: true, page_id };

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
