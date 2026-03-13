// Fulfillment Services tools — Shopify Admin API 2024-01
// Covers: list_fulfillment_services, get_fulfillment_service, create_fulfillment_service,
//         update_fulfillment_service, delete_fulfillment_service

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyFulfillmentService {
  id: number;
  name: string;
  handle?: string;
  callback_url?: string;
  fulfillment_orders_opt_in?: boolean;
  inventory_management?: boolean;
  location_id?: number;
  requires_shipping_method?: boolean;
  tracking_support?: boolean;
  format?: string;
  service_name?: string;
  email?: string | null;
  include_pending_stock?: boolean;
}

// === Zod Schemas ===
const ListFulfillmentServicesSchema = z.object({
  scope: z.enum(["current_client", "all"]).optional().default("current_client").describe("'current_client' for services created by this app, 'all' for all services"),
});

const GetFulfillmentServiceSchema = z.object({
  fulfillment_service_id: z.string(),
});

const CreateFulfillmentServiceSchema = z.object({
  name: z.string().describe("Service name"),
  callback_url: z.string().url().describe("URL for Shopify to call with fulfillment requests"),
  inventory_management: z.boolean().optional().describe("Whether the service tracks inventory"),
  tracking_support: z.boolean().optional().describe("Whether the service provides tracking numbers"),
  requires_shipping_method: z.boolean().optional(),
  format: z.enum(["json", "xml"]).optional().default("json"),
  fulfillment_orders_opt_in: z.boolean().optional().describe("Whether to use fulfillment orders API"),
  include_pending_stock: z.boolean().optional(),
});

const UpdateFulfillmentServiceSchema = z.object({
  fulfillment_service_id: z.string(),
  name: z.string().optional(),
  callback_url: z.string().url().optional(),
  inventory_management: z.boolean().optional(),
  tracking_support: z.boolean().optional(),
});

const DeleteFulfillmentServiceSchema = z.object({
  fulfillment_service_id: z.string(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_fulfillment_services",
      title: "List Fulfillment Services",
      description: "List fulfillment services available to the store. Fulfillment services are external providers (like ShipBob, Amazon FBA) that handle packing and shipping.",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["current_client", "all"], description: "'current_client' or 'all'" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_fulfillment_service",
      title: "Get Fulfillment Service",
      description: "Get details for a specific fulfillment service by ID.",
      inputSchema: {
        type: "object",
        properties: { fulfillment_service_id: { type: "string" } },
        required: ["fulfillment_service_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_fulfillment_service",
      title: "Create Fulfillment Service",
      description: "Register a new fulfillment service with the store. The service receives fulfillment requests via its callback URL.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          callback_url: { type: "string" },
          inventory_management: { type: "boolean" },
          tracking_support: { type: "boolean" },
          requires_shipping_method: { type: "boolean" },
          format: { type: "string", enum: ["json", "xml"] },
          fulfillment_orders_opt_in: { type: "boolean" },
        },
        required: ["name", "callback_url"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_fulfillment_service",
      title: "Update Fulfillment Service",
      description: "Update a fulfillment service's name, callback URL, or capabilities.",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment_service_id: { type: "string" },
          name: { type: "string" },
          callback_url: { type: "string" },
          inventory_management: { type: "boolean" },
          tracking_support: { type: "boolean" },
        },
        required: ["fulfillment_service_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_fulfillment_service",
      title: "Delete Fulfillment Service",
      description: "Permanently delete a fulfillment service. This also unlinks all products assigned to it.",
      inputSchema: {
        type: "object",
        properties: { fulfillment_service_id: { type: "string" } },
        required: ["fulfillment_service_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_fulfillment_services: async (args) => {
      const { scope } = ListFulfillmentServicesSchema.parse(args);
      const data = await logger.time("tool.list_fulfillment_services", () =>
        client.get<{ fulfillment_services: ShopifyFulfillmentService[] }>(`/fulfillment_services.json?scope=${scope}`)
      , { tool: "list_fulfillment_services" });
      const services = (data as { fulfillment_services: ShopifyFulfillmentService[] }).fulfillment_services;
      const response = { data: services, meta: { count: services.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_fulfillment_service: async (args) => {
      const { fulfillment_service_id } = GetFulfillmentServiceSchema.parse(args);
      const data = await logger.time("tool.get_fulfillment_service", () =>
        client.get<{ fulfillment_service: ShopifyFulfillmentService }>(`/fulfillment_services/${fulfillment_service_id}.json`)
      , { tool: "get_fulfillment_service" });
      const service = (data as { fulfillment_service: ShopifyFulfillmentService }).fulfillment_service;
      return { content: [{ type: "text", text: JSON.stringify(service, null, 2) }], structuredContent: service };
    },

    create_fulfillment_service: async (args) => {
      const params = CreateFulfillmentServiceSchema.parse(args);
      const data = await logger.time("tool.create_fulfillment_service", () =>
        client.post<{ fulfillment_service: ShopifyFulfillmentService }>("/fulfillment_services.json", { fulfillment_service: params })
      , { tool: "create_fulfillment_service" });
      const service = (data as { fulfillment_service: ShopifyFulfillmentService }).fulfillment_service;
      return { content: [{ type: "text", text: JSON.stringify(service, null, 2) }], structuredContent: service };
    },

    update_fulfillment_service: async (args) => {
      const { fulfillment_service_id, ...updateData } = UpdateFulfillmentServiceSchema.parse(args);
      const data = await logger.time("tool.update_fulfillment_service", () =>
        client.put<{ fulfillment_service: ShopifyFulfillmentService }>(`/fulfillment_services/${fulfillment_service_id}.json`, { fulfillment_service: updateData })
      , { tool: "update_fulfillment_service" });
      const service = (data as { fulfillment_service: ShopifyFulfillmentService }).fulfillment_service;
      return { content: [{ type: "text", text: JSON.stringify(service, null, 2) }], structuredContent: service };
    },

    delete_fulfillment_service: async (args) => {
      const { fulfillment_service_id } = DeleteFulfillmentServiceSchema.parse(args);
      await logger.time("tool.delete_fulfillment_service", () =>
        client.delete<unknown>(`/fulfillment_services/${fulfillment_service_id}.json`)
      , { tool: "delete_fulfillment_service" });
      const response = { success: true, fulfillment_service_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
