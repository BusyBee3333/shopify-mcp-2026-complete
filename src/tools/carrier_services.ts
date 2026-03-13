// Carrier Services tools — Shopify Admin API 2024-01
// Covers: list_carrier_services, get_carrier_service, create_carrier_service,
//         update_carrier_service, delete_carrier_service

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyCarrierService {
  id: number;
  name: string;
  callback_url?: string;
  format?: string;
  service_discovery?: boolean;
  carrier_service_type?: string;
  admin_graphql_api_id?: string;
  active?: boolean;
}

// === Zod Schemas ===
const ListCarrierServicesSchema = z.object({});

const GetCarrierServiceSchema = z.object({ carrier_service_id: z.string() });

const CreateCarrierServiceSchema = z.object({
  name: z.string().describe("Carrier service name shown at checkout"),
  callback_url: z.string().url().describe("URL Shopify calls to get shipping rates"),
  format: z.enum(["json", "xml"]).optional().default("json"),
  service_discovery: z.boolean().optional().describe("Whether to offer service discovery"),
  carrier_service_type: z.enum(["api", "legacy"]).optional().default("api"),
  active: z.boolean().optional().default(true),
});

const UpdateCarrierServiceSchema = z.object({
  carrier_service_id: z.string(),
  name: z.string().optional(),
  callback_url: z.string().url().optional(),
  active: z.boolean().optional(),
  service_discovery: z.boolean().optional(),
});

const DeleteCarrierServiceSchema = z.object({ carrier_service_id: z.string() });

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_carrier_services",
      title: "List Carrier Services",
      description: "List all carrier services (custom shipping rate providers) configured in the store. These are external services that provide real-time shipping rates at checkout.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_carrier_service",
      title: "Get Carrier Service",
      description: "Get details for a specific carrier service by ID.",
      inputSchema: {
        type: "object",
        properties: { carrier_service_id: { type: "string" } },
        required: ["carrier_service_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_carrier_service",
      title: "Create Carrier Service",
      description: "Register a new carrier service. Shopify will call the callback_url with cart contents and origin/destination to fetch shipping rates to display at checkout.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          callback_url: { type: "string" },
          format: { type: "string", enum: ["json", "xml"] },
          service_discovery: { type: "boolean" },
          active: { type: "boolean" },
        },
        required: ["name", "callback_url"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_carrier_service",
      title: "Update Carrier Service",
      description: "Update a carrier service's name, callback URL, or active status.",
      inputSchema: {
        type: "object",
        properties: {
          carrier_service_id: { type: "string" },
          name: { type: "string" },
          callback_url: { type: "string" },
          active: { type: "boolean" },
          service_discovery: { type: "boolean" },
        },
        required: ["carrier_service_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_carrier_service",
      title: "Delete Carrier Service",
      description: "Delete a carrier service. Checkout will no longer query this service for shipping rates.",
      inputSchema: {
        type: "object",
        properties: { carrier_service_id: { type: "string" } },
        required: ["carrier_service_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_carrier_services: async (_args) => {
      const data = await logger.time("tool.list_carrier_services", () =>
        client.get<{ carrier_services: ShopifyCarrierService[] }>("/carrier_services.json")
      , { tool: "list_carrier_services" });
      const services = (data as { carrier_services: ShopifyCarrierService[] }).carrier_services;
      const response = { data: services, meta: { count: services.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_carrier_service: async (args) => {
      const { carrier_service_id } = GetCarrierServiceSchema.parse(args);
      const data = await logger.time("tool.get_carrier_service", () =>
        client.get<{ carrier_service: ShopifyCarrierService }>(`/carrier_services/${carrier_service_id}.json`)
      , { tool: "get_carrier_service" });
      const service = (data as { carrier_service: ShopifyCarrierService }).carrier_service;
      return { content: [{ type: "text", text: JSON.stringify(service, null, 2) }], structuredContent: service };
    },

    create_carrier_service: async (args) => {
      const params = CreateCarrierServiceSchema.parse(args);
      const data = await logger.time("tool.create_carrier_service", () =>
        client.post<{ carrier_service: ShopifyCarrierService }>("/carrier_services.json", { carrier_service: params })
      , { tool: "create_carrier_service" });
      const service = (data as { carrier_service: ShopifyCarrierService }).carrier_service;
      return { content: [{ type: "text", text: JSON.stringify(service, null, 2) }], structuredContent: service };
    },

    update_carrier_service: async (args) => {
      const { carrier_service_id, ...updateData } = UpdateCarrierServiceSchema.parse(args);
      const data = await logger.time("tool.update_carrier_service", () =>
        client.put<{ carrier_service: ShopifyCarrierService }>(`/carrier_services/${carrier_service_id}.json`, { carrier_service: updateData })
      , { tool: "update_carrier_service" });
      const service = (data as { carrier_service: ShopifyCarrierService }).carrier_service;
      return { content: [{ type: "text", text: JSON.stringify(service, null, 2) }], structuredContent: service };
    },

    delete_carrier_service: async (args) => {
      const { carrier_service_id } = DeleteCarrierServiceSchema.parse(args);
      await logger.time("tool.delete_carrier_service", () =>
        client.delete<unknown>(`/carrier_services/${carrier_service_id}.json`)
      , { tool: "delete_carrier_service" });
      const response = { success: true, carrier_service_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
