// Access Scopes & App Info tools — Shopify Admin API 2024-01
// Covers: list_access_scopes, get_app_installation

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyAccessScope {
  handle: string;
}

// === Zod Schemas ===
const ListAccessScopesSchema = z.object({});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_access_scopes",
      title: "List API Access Scopes",
      description: "List the access scopes granted to the current API credentials. Use this to check which Shopify Admin API permissions are available before calling specific endpoints.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_access_scopes: async (_args) => {
      const data = await logger.time("tool.list_access_scopes", () =>
        client.get<{ access_scopes: ShopifyAccessScope[] }>("/oauth/access_scopes.json")
      , { tool: "list_access_scopes" });
      const scopes = (data as { access_scopes: ShopifyAccessScope[] }).access_scopes;
      const response = { data: scopes, meta: { count: scopes.length, handles: scopes.map((s) => s.handle) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
