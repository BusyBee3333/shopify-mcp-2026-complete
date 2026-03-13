// Webhooks tools — Shopify Admin API 2024-01
// Covers: list_webhooks, create_webhook, get_webhook, delete_webhook

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyWebhook {
  id?: number;
  address?: string;
  topic?: string;
  format?: string;
  api_version?: string;
  created_at?: string;
  updated_at?: string;
  fields?: string[];
  metafield_namespaces?: string[];
}

// === Zod Schemas ===
const WebhookTopicEnum = z.enum([
  "app/uninstalled",
  "carts/create", "carts/update",
  "checkouts/create", "checkouts/delete", "checkouts/update",
  "collection_listings/add", "collection_listings/remove", "collection_listings/update",
  "collections/create", "collections/delete", "collections/update",
  "customer_groups/create", "customer_groups/delete", "customer_groups/update",
  "customer_payment_methods/create", "customer_payment_methods/revoke", "customer_payment_methods/update",
  "customers/create", "customers/delete", "customers/disable", "customers/enable", "customers/update",
  "customers_marketing_consent/update",
  "draft_orders/create", "draft_orders/delete", "draft_orders/update",
  "fulfillment_events/create", "fulfillment_events/delete",
  "fulfillments/create", "fulfillments/update",
  "inventory_items/create", "inventory_items/delete", "inventory_items/update",
  "inventory_levels/connect", "inventory_levels/disconnect", "inventory_levels/update",
  "locales/create", "locales/update",
  "locations/activate", "locations/create", "locations/deactivate", "locations/delete", "locations/update",
  "order_transactions/create",
  "orders/cancelled", "orders/create", "orders/delete", "orders/edited",
  "orders/fulfilled", "orders/paid", "orders/partially_fulfilled", "orders/updated",
  "payment_schedules/due",
  "product_listings/add", "product_listings/remove", "product_listings/update",
  "products/create", "products/delete", "products/update",
  "profiles/create", "profiles/delete", "profiles/update",
  "refunds/create",
  "selling_plan_groups/create", "selling_plan_groups/delete", "selling_plan_groups/update",
  "shop/update",
  "subscription_billing_attempts/challenged", "subscription_billing_attempts/failure", "subscription_billing_attempts/success",
  "subscription_contracts/create", "subscription_contracts/update",
  "tender_transactions/create",
  "themes/create", "themes/delete", "themes/publish", "themes/update",
]);

const ListWebhooksSchema = z.object({
  topic: WebhookTopicEnum.optional().describe("Filter by webhook topic"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
});

const GetWebhookSchema = z.object({
  webhook_id: z.string().describe("Shopify webhook ID"),
});

const CreateWebhookSchema = z.object({
  topic: WebhookTopicEnum.describe("Shopify webhook topic (event to subscribe to)"),
  address: z.string().url().describe("Public HTTPS URL to receive the webhook POST"),
  format: z.enum(["json", "xml"]).optional().default("json").describe("Payload format (json recommended)"),
  fields: z.array(z.string()).optional().describe("Optional list of fields to include in the payload"),
  metafield_namespaces: z.array(z.string()).optional().describe("Metafield namespaces to include"),
});

const DeleteWebhookSchema = z.object({
  webhook_id: z.string().describe("Shopify webhook ID to delete"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_webhooks",
      title: "List Webhooks",
      description:
        "List all Shopify webhooks registered on the store. Returns topic, address URL, format, and timestamps. Supports filtering by topic and cursor-based pagination. Use to audit registered webhook endpoints.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Filter by webhook topic (e.g. orders/create)" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: { count: { type: "number" }, hasMore: { type: "boolean" }, nextPageInfo: { type: "string" } },
          },
        },
        required: ["data", "meta"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "get_webhook",
      title: "Get Webhook",
      description:
        "Get full details for a specific Shopify webhook by ID. Returns topic, address, format, and all configuration. Use when verifying a specific webhook's settings.",
      inputSchema: {
        type: "object",
        properties: {
          webhook_id: { type: "string", description: "Shopify webhook ID" },
        },
        required: ["webhook_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          topic: { type: "string" },
          address: { type: "string" },
          format: { type: "string" },
          created_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "create_webhook",
      title: "Create Webhook",
      description:
        "Register a new Shopify webhook to receive real-time notifications when specific events occur (e.g. orders/create, products/update). The address must be a publicly accessible HTTPS URL.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Event topic (e.g. orders/create, products/update)" },
          address: { type: "string", description: "Public HTTPS URL to receive notifications" },
          format: { type: "string", enum: ["json", "xml"], description: "Payload format (default: json)" },
          fields: { type: "array", items: { type: "string" }, description: "Fields to include in payload" },
          metafield_namespaces: { type: "array", items: { type: "string" }, description: "Metafield namespaces to include" },
        },
        required: ["topic", "address"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          topic: { type: "string" },
          address: { type: "string" },
          created_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "delete_webhook",
      title: "Delete Webhook",
      description:
        "Delete a Shopify webhook registration. After deletion, the endpoint will no longer receive events for that topic. Use list_webhooks to find the webhook ID first.",
      inputSchema: {
        type: "object",
        properties: {
          webhook_id: { type: "string", description: "Webhook ID to delete" },
        },
        required: ["webhook_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          webhook_id: { type: "string" },
        },
        required: ["success"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_webhooks: async (args) => {
      const params = ListWebhooksSchema.parse(args);
      let result: { data: ShopifyWebhook[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_webhooks", () =>
          client.paginateFromCursor<ShopifyWebhook>("/webhooks.json", params.page_info!, params.limit)
        , { tool: "list_webhooks" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.topic) extraParams.topic = params.topic;

        result = await logger.time("tool.list_webhooks", () =>
          client.paginatedGet<ShopifyWebhook>("/webhooks.json", extraParams, params.limit)
        , { tool: "list_webhooks" });
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

    get_webhook: async (args) => {
      const { webhook_id } = GetWebhookSchema.parse(args);
      const data = await logger.time("tool.get_webhook", () =>
        client.get<{ webhook: ShopifyWebhook }>(`/webhooks/${webhook_id}.json`)
      , { tool: "get_webhook", webhook_id });

      const webhook = (data as { webhook: ShopifyWebhook }).webhook;

      return {
        content: [{ type: "text", text: JSON.stringify(webhook, null, 2) }],
        structuredContent: webhook,
      };
    },

    create_webhook: async (args) => {
      const params = CreateWebhookSchema.parse(args);
      const data = await logger.time("tool.create_webhook", () =>
        client.post<{ webhook: ShopifyWebhook }>("/webhooks.json", { webhook: params })
      , { tool: "create_webhook" });

      const webhook = (data as { webhook: ShopifyWebhook }).webhook;

      return {
        content: [{ type: "text", text: JSON.stringify(webhook, null, 2) }],
        structuredContent: webhook,
      };
    },

    delete_webhook: async (args) => {
      const { webhook_id } = DeleteWebhookSchema.parse(args);
      await logger.time("tool.delete_webhook", () =>
        client.delete<unknown>(`/webhooks/${webhook_id}.json`)
      , { tool: "delete_webhook", webhook_id });

      const response = { success: true, webhook_id };

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
