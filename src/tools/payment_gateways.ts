// Payment Gateways tools — Shopify Admin API 2024-01
// Covers: list_payment_gateways, get_payment_gateway, create_payment_gateway,
//         update_payment_gateway, delete_payment_gateway

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyPaymentGateway {
  id: number;
  name: string;
  provider_name?: string;
  service_name?: string;
  enabled?: boolean;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  credential1?: string | null;
  credential2?: string | null;
  credential3?: string | null;
  credential4?: string | null;
  attachment?: string | null;
  disabled?: boolean;
  type?: string;
}

// === Zod Schemas ===
const ListPaymentGatewaysSchema = z.object({});

const GetPaymentGatewaySchema = z.object({ payment_gateway_id: z.string() });

const CreatePaymentGatewaySchema = z.object({
  provider_name: z.string().describe("Name of the payment gateway provider"),
  credential1: z.string().optional().describe("First credential (e.g. API key)"),
  credential2: z.string().optional().describe("Second credential (e.g. secret)"),
  credential3: z.string().optional().describe("Third credential"),
  credential4: z.string().optional().describe("Fourth credential"),
  active: z.boolean().optional().default(true),
});

const UpdatePaymentGatewaySchema = z.object({
  payment_gateway_id: z.string(),
  credential1: z.string().optional(),
  credential2: z.string().optional(),
  credential3: z.string().optional(),
  credential4: z.string().optional(),
  active: z.boolean().optional(),
});

const DeletePaymentGatewaySchema = z.object({ payment_gateway_id: z.string() });

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_payment_gateways",
      title: "List Payment Gateways",
      description: "List all payment gateways (credit card processors, payment providers) configured in the store.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_payment_gateway",
      title: "Get Payment Gateway",
      description: "Get details for a specific payment gateway by ID.",
      inputSchema: {
        type: "object",
        properties: { payment_gateway_id: { type: "string" } },
        required: ["payment_gateway_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_payment_gateway",
      title: "Create Payment Gateway",
      description: "Add a payment gateway to the store. Provide credentials required by the gateway provider.",
      inputSchema: {
        type: "object",
        properties: {
          provider_name: { type: "string" },
          credential1: { type: "string" },
          credential2: { type: "string" },
          credential3: { type: "string" },
          credential4: { type: "string" },
          active: { type: "boolean" },
        },
        required: ["provider_name"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_payment_gateway",
      title: "Update Payment Gateway",
      description: "Update credentials or active status for an existing payment gateway.",
      inputSchema: {
        type: "object",
        properties: {
          payment_gateway_id: { type: "string" },
          credential1: { type: "string" },
          credential2: { type: "string" },
          active: { type: "boolean" },
        },
        required: ["payment_gateway_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_payment_gateway",
      title: "Delete Payment Gateway",
      description: "Remove a payment gateway from the store.",
      inputSchema: {
        type: "object",
        properties: { payment_gateway_id: { type: "string" } },
        required: ["payment_gateway_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_payment_gateways: async (_args) => {
      const data = await logger.time("tool.list_payment_gateways", () =>
        client.get<{ payment_gateways: ShopifyPaymentGateway[] }>("/payment_gateways.json")
      , { tool: "list_payment_gateways" });
      const gateways = (data as { payment_gateways: ShopifyPaymentGateway[] }).payment_gateways;
      const response = { data: gateways, meta: { count: gateways.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_payment_gateway: async (args) => {
      const { payment_gateway_id } = GetPaymentGatewaySchema.parse(args);
      const data = await logger.time("tool.get_payment_gateway", () =>
        client.get<{ payment_gateway: ShopifyPaymentGateway }>(`/payment_gateways/${payment_gateway_id}.json`)
      , { tool: "get_payment_gateway" });
      const gw = (data as { payment_gateway: ShopifyPaymentGateway }).payment_gateway;
      return { content: [{ type: "text", text: JSON.stringify(gw, null, 2) }], structuredContent: gw };
    },

    create_payment_gateway: async (args) => {
      const params = CreatePaymentGatewaySchema.parse(args);
      const data = await logger.time("tool.create_payment_gateway", () =>
        client.post<{ payment_gateway: ShopifyPaymentGateway }>("/payment_gateways.json", { payment_gateway: params })
      , { tool: "create_payment_gateway" });
      const gw = (data as { payment_gateway: ShopifyPaymentGateway }).payment_gateway;
      return { content: [{ type: "text", text: JSON.stringify(gw, null, 2) }], structuredContent: gw };
    },

    update_payment_gateway: async (args) => {
      const { payment_gateway_id, ...updateData } = UpdatePaymentGatewaySchema.parse(args);
      const data = await logger.time("tool.update_payment_gateway", () =>
        client.put<{ payment_gateway: ShopifyPaymentGateway }>(`/payment_gateways/${payment_gateway_id}.json`, { payment_gateway: updateData })
      , { tool: "update_payment_gateway" });
      const gw = (data as { payment_gateway: ShopifyPaymentGateway }).payment_gateway;
      return { content: [{ type: "text", text: JSON.stringify(gw, null, 2) }], structuredContent: gw };
    },

    delete_payment_gateway: async (args) => {
      const { payment_gateway_id } = DeletePaymentGatewaySchema.parse(args);
      await logger.time("tool.delete_payment_gateway", () =>
        client.delete<unknown>(`/payment_gateways/${payment_gateway_id}.json`)
      , { tool: "delete_payment_gateway" });
      const response = { success: true, payment_gateway_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
