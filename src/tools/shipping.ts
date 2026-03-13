// Shipping tools — Shopify Admin API 2024-01
// Covers: list_shipping_zones, get_fulfillment_services, create_carrier_service

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyShippingZone {
  id: number;
  name?: string;
  countries?: unknown[];
  weight_based_shipping_rates?: unknown[];
  price_based_shipping_rates?: unknown[];
  carrier_shipping_rate_providers?: unknown[];
  created_at?: string;
  updated_at?: string;
}

interface ShopifyFulfillmentService {
  id?: number;
  name?: string;
  handle?: string;
  fulfillment_orders_opt_in?: boolean;
  include_pending_stock?: boolean;
  provider_id?: number | null;
  location_id?: number;
  callback_url?: string | null;
  tracking_support?: boolean;
  inventory_management?: boolean;
  email?: string | null;
  type?: string;
}

interface ShopifyCarrierService {
  id?: number;
  name?: string;
  active?: boolean;
  callback_url?: string;
  carrier_service_type?: string;
  admin_graphql_api_id?: string;
  format?: string;
  supports_service_discovery?: boolean;
}

// === Zod Schemas ===
const ListShippingZonesSchema = z.object({
  fields: z.string().optional().describe("Comma-separated list of fields to return"),
});

const GetFulfillmentServicesSchema = z.object({
  scope: z.enum(["current_client", "all"]).optional().default("all").describe("Scope of fulfillment services to return"),
});

const CreateCarrierServiceSchema = z.object({
  name: z.string().describe("Name for the carrier service"),
  callback_url: z.string().url().describe("URL Shopify will POST to for shipping rates"),
  carrier_service_type: z.enum(["api", "legacy"]).optional().default("api").describe("Type of carrier service"),
  active: z.boolean().optional().default(true).describe("Whether this carrier service is active"),
  supports_service_discovery: z.boolean().optional().default(false).describe("Whether to discover available services from callback"),
  format: z.enum(["json", "xml"]).optional().default("json").describe("Format for callbacks"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_shipping_zones",
      title: "List Shipping Zones",
      description:
        "List all Shopify shipping zones with their countries, rates (weight-based, price-based), and carrier rate providers. Use when auditing shipping configurations or finding available zones for rate calculations.",
      inputSchema: {
        type: "object",
        properties: {
          fields: { type: "string", description: "Comma-separated fields to return (optional)" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" } } },
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
      name: "get_fulfillment_services",
      title: "Get Fulfillment Services",
      description:
        "List fulfillment services available to the Shopify store. Use scope='all' to see all services, or 'current_client' for only the app's own services. Returns service names, location IDs, and capabilities.",
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["current_client", "all"],
            description: "Scope: 'all' for all services, 'current_client' for app's own services",
          },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" } } },
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
      name: "create_carrier_service",
      title: "Create Carrier Service",
      description:
        "Register a custom carrier service (shipping rate provider) with Shopify. Shopify will call your callback_url to get live shipping rates at checkout. Requires a publicly accessible HTTPS URL.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Carrier service name" },
          callback_url: { type: "string", description: "HTTPS URL for rate requests" },
          carrier_service_type: { type: "string", enum: ["api", "legacy"], description: "Service type (default: api)" },
          active: { type: "boolean", description: "Whether active (default: true)" },
          supports_service_discovery: { type: "boolean", description: "Discover services from callback (default: false)" },
          format: { type: "string", enum: ["json", "xml"], description: "Callback format (default: json)" },
        },
        required: ["name", "callback_url"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          name: { type: "string" },
          active: { type: "boolean" },
          callback_url: { type: "string" },
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
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_shipping_zones: async (args) => {
      const params = ListShippingZonesSchema.parse(args);
      const extraParams: Record<string, string> = {};
      if (params.fields) extraParams.fields = params.fields;

      const result = await logger.time("tool.list_shipping_zones", () =>
        client.paginatedGet<ShopifyShippingZone>("/shipping_zones.json", extraParams, 250)
      , { tool: "list_shipping_zones" });

      const response = {
        data: result.data,
        meta: { count: result.data.length },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_fulfillment_services: async (args) => {
      const params = GetFulfillmentServicesSchema.parse(args);
      const extraParams: Record<string, string> = {};
      if (params.scope) extraParams.scope = params.scope;

      const result = await logger.time("tool.get_fulfillment_services", () =>
        client.paginatedGet<ShopifyFulfillmentService>("/fulfillment_services.json", extraParams, 250)
      , { tool: "get_fulfillment_services" });

      const response = {
        data: result.data,
        meta: { count: result.data.length },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    create_carrier_service: async (args) => {
      const params = CreateCarrierServiceSchema.parse(args);
      const data = await logger.time("tool.create_carrier_service", () =>
        client.post<{ carrier_service: ShopifyCarrierService }>("/carrier_services.json", { carrier_service: params })
      , { tool: "create_carrier_service" });

      const service = (data as { carrier_service: ShopifyCarrierService }).carrier_service;

      return {
        content: [{ type: "text", text: JSON.stringify(service, null, 2) }],
        structuredContent: service,
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
