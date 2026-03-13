// Script Tags tools — Shopify Admin API 2024-01
// Covers: list_script_tags, create_script_tag, delete_script_tag
// Script tags inject remote JavaScript into Online Store and Order Status pages.

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyScriptTag {
  id?: number;
  src?: string;
  event?: string;
  display_scope?: string;
  cache?: boolean;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListScriptTagsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
  src: z.string().optional().describe("Filter by exact script src URL"),
});

const CreateScriptTagSchema = z.object({
  src: z.string().url().describe("Public HTTPS URL of the JavaScript file to inject"),
  event: z.enum(["onload"]).optional().default("onload").describe("DOM event to trigger script load (currently only 'onload' supported)"),
  display_scope: z.enum(["online_store", "order_status", "all"]).optional().default("all").describe("Where to inject the script: online_store pages, order_status page, or all"),
  cache: z.boolean().optional().default(false).describe("Whether Shopify should cache the script (default: false)"),
});

const DeleteScriptTagSchema = z.object({
  script_tag_id: z.string().describe("Shopify script tag ID to delete"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_script_tags",
      title: "List Script Tags",
      description:
        "List all script tags registered on the Shopify store. Script tags inject remote JavaScript into Online Store and Order Status pages. Returns the src URL, event trigger, display scope, and timestamps. Use to audit third-party scripts loaded on your storefront.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          src: { type: "string", description: "Filter by exact script src URL" },
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
      name: "create_script_tag",
      title: "Create Script Tag",
      description:
        "Register a remote JavaScript file to be injected into Shopify Online Store and/or Order Status pages. The src URL must be publicly accessible over HTTPS. Use display_scope to target specific pages. Script tags are loaded asynchronously on page load.",
      inputSchema: {
        type: "object",
        properties: {
          src: { type: "string", description: "Public HTTPS URL of the JavaScript file to inject" },
          event: { type: "string", enum: ["onload"], description: "Trigger event (currently only 'onload')" },
          display_scope: { type: "string", enum: ["online_store", "order_status", "all"], description: "Pages to inject on (default: all)" },
          cache: { type: "boolean", description: "Cache the script (default: false)" },
        },
        required: ["src"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, src: { type: "string" }, display_scope: { type: "string" }, created_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_script_tag",
      title: "Delete Script Tag",
      description:
        "Delete a script tag registration from Shopify. After deletion, the script will no longer be injected into storefront pages. Use list_script_tags to find the script tag ID first.",
      inputSchema: {
        type: "object",
        properties: {
          script_tag_id: { type: "string", description: "Script tag ID to delete" },
        },
        required: ["script_tag_id"],
      },
      outputSchema: {
        type: "object",
        properties: { success: { type: "boolean" }, script_tag_id: { type: "string" } },
        required: ["success"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_script_tags: async (args) => {
      const params = ListScriptTagsSchema.parse(args);
      let result: { data: ShopifyScriptTag[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_script_tags", () =>
          client.paginateFromCursor<ShopifyScriptTag>("/script_tags.json", params.page_info!, params.limit)
        , { tool: "list_script_tags" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.src) extraParams.src = params.src;

        result = await logger.time("tool.list_script_tags", () =>
          client.paginatedGet<ShopifyScriptTag>("/script_tags.json", extraParams, params.limit)
        , { tool: "list_script_tags" });
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

    create_script_tag: async (args) => {
      const params = CreateScriptTagSchema.parse(args);
      const data = await logger.time("tool.create_script_tag", () =>
        client.post<{ script_tag: ShopifyScriptTag }>("/script_tags.json", { script_tag: params })
      , { tool: "create_script_tag" });

      const script_tag = (data as { script_tag: ShopifyScriptTag }).script_tag;

      return {
        content: [{ type: "text", text: JSON.stringify(script_tag, null, 2) }],
        structuredContent: script_tag,
      };
    },

    delete_script_tag: async (args) => {
      const { script_tag_id } = DeleteScriptTagSchema.parse(args);
      await logger.time("tool.delete_script_tag", () =>
        client.delete<unknown>(`/script_tags/${script_tag_id}.json`)
      , { tool: "delete_script_tag", script_tag_id });

      const response = { success: true, script_tag_id };

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
