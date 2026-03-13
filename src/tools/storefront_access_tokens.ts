// Storefront Access Tokens tools — Shopify Admin API 2024-01
// Covers: list_storefront_access_tokens, create_storefront_access_token, delete_storefront_access_token

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyStorefrontAccessToken {
  id: number;
  title: string;
  access_token?: string;
  access_scope?: string;
  created_at?: string;
  admin_graphql_api_id?: string;
}

// === Zod Schemas ===
const ListStorefrontAccessTokensSchema = z.object({});

const CreateStorefrontAccessTokenSchema = z.object({
  title: z.string().describe("Descriptive title for this access token (e.g. 'Mobile App Storefront')"),
});

const DeleteStorefrontAccessTokenSchema = z.object({
  storefront_access_token_id: z.string().describe("Storefront access token ID to revoke"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_storefront_access_tokens",
      title: "List Storefront Access Tokens",
      description: "List all Storefront API access tokens for this store. Storefront tokens provide read-only access to published products/collections for headless storefronts, mobile apps, and buy buttons.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_storefront_access_token",
      title: "Create Storefront Access Token",
      description: "Create a new Storefront API access token. Use this for headless commerce, mobile apps, or any frontend that needs to query published products and collections without a full Admin API token.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Descriptive title (e.g. 'Mobile App Storefront')" },
        },
        required: ["title"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_storefront_access_token",
      title: "Delete Storefront Access Token",
      description: "Revoke and permanently delete a Storefront API access token. Any apps using this token will lose access immediately.",
      inputSchema: {
        type: "object",
        properties: { storefront_access_token_id: { type: "string" } },
        required: ["storefront_access_token_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_storefront_access_tokens: async (_args) => {
      const data = await logger.time("tool.list_storefront_access_tokens", () =>
        client.get<{ storefront_access_tokens: ShopifyStorefrontAccessToken[] }>("/storefront_access_tokens.json")
      , { tool: "list_storefront_access_tokens" });
      const tokens = (data as { storefront_access_tokens: ShopifyStorefrontAccessToken[] }).storefront_access_tokens;
      const response = { data: tokens, meta: { count: tokens.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    create_storefront_access_token: async (args) => {
      const { title } = CreateStorefrontAccessTokenSchema.parse(args);
      const data = await logger.time("tool.create_storefront_access_token", () =>
        client.post<{ storefront_access_token: ShopifyStorefrontAccessToken }>("/storefront_access_tokens.json", { storefront_access_token: { title } })
      , { tool: "create_storefront_access_token" });
      const token = (data as { storefront_access_token: ShopifyStorefrontAccessToken }).storefront_access_token;
      return { content: [{ type: "text", text: JSON.stringify(token, null, 2) }], structuredContent: token };
    },

    delete_storefront_access_token: async (args) => {
      const { storefront_access_token_id } = DeleteStorefrontAccessTokenSchema.parse(args);
      await logger.time("tool.delete_storefront_access_token", () =>
        client.delete<unknown>(`/storefront_access_tokens/${storefront_access_token_id}.json`)
      , { tool: "delete_storefront_access_token" });
      const response = { success: true, storefront_access_token_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
