// Order Risks tools — Shopify Admin API 2024-01
// Covers: list_order_risks, get_order_risk, create_order_risk, update_order_risk, delete_order_risk

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyOrderRisk {
  id: number;
  order_id: number;
  checkout_id?: number | null;
  source?: string;
  score?: string;
  recommendation?: string;
  display?: boolean;
  cause_cancel?: boolean;
  message?: string;
  merchant_message?: string | null;
}

// === Zod Schemas ===
const ListOrderRisksSchema = z.object({
  order_id: z.string().describe("Order ID"),
});

const GetOrderRiskSchema = z.object({
  order_id: z.string(),
  risk_id: z.string(),
});

const CreateOrderRiskSchema = z.object({
  order_id: z.string(),
  message: z.string().describe("Risk message shown to merchant"),
  recommendation: z.enum(["cancel", "investigate", "accept"]).describe("Recommended action"),
  score: z.string().describe("Risk score 0.0-1.0 as a string"),
  source: z.string().optional().describe("Source app or provider"),
  cause_cancel: z.boolean().optional().describe("Whether this risk should auto-cancel the order"),
  display: z.boolean().optional().describe("Whether to display risk to merchant"),
});

const UpdateOrderRiskSchema = z.object({
  order_id: z.string(),
  risk_id: z.string(),
  message: z.string().optional(),
  recommendation: z.enum(["cancel", "investigate", "accept"]).optional(),
  score: z.string().optional(),
  cause_cancel: z.boolean().optional(),
  display: z.boolean().optional(),
});

const DeleteOrderRiskSchema = z.object({ order_id: z.string(), risk_id: z.string() });

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_order_risks",
      title: "List Order Risks",
      description: "List all fraud risk assessments for an order. Returns risk score, recommendation (cancel/investigate/accept), and source.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_order_risk",
      title: "Get Order Risk",
      description: "Get a specific risk assessment for an order.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" }, risk_id: { type: "string" } },
        required: ["order_id", "risk_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_order_risk",
      title: "Create Order Risk",
      description: "Add a fraud risk assessment to an order. Used by fraud detection apps to flag orders for review or cancellation.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          message: { type: "string" },
          recommendation: { type: "string", enum: ["cancel", "investigate", "accept"] },
          score: { type: "string", description: "0.0-1.0" },
          source: { type: "string" },
          cause_cancel: { type: "boolean" },
          display: { type: "boolean" },
        },
        required: ["order_id", "message", "recommendation", "score"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_order_risk",
      title: "Update Order Risk",
      description: "Update an existing risk assessment on an order.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          risk_id: { type: "string" },
          message: { type: "string" },
          recommendation: { type: "string" },
          score: { type: "string" },
          cause_cancel: { type: "boolean" },
          display: { type: "boolean" },
        },
        required: ["order_id", "risk_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_order_risk",
      title: "Delete Order Risk",
      description: "Remove a risk assessment from an order.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" }, risk_id: { type: "string" } },
        required: ["order_id", "risk_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_order_risks: async (args) => {
      const { order_id } = ListOrderRisksSchema.parse(args);
      const data = await logger.time("tool.list_order_risks", () =>
        client.get<{ risks: ShopifyOrderRisk[] }>(`/orders/${order_id}/risks.json`)
      , { tool: "list_order_risks" });
      const risks = (data as { risks: ShopifyOrderRisk[] }).risks;
      const response = { data: risks, meta: { count: risks.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_order_risk: async (args) => {
      const { order_id, risk_id } = GetOrderRiskSchema.parse(args);
      const data = await logger.time("tool.get_order_risk", () =>
        client.get<{ risk: ShopifyOrderRisk }>(`/orders/${order_id}/risks/${risk_id}.json`)
      , { tool: "get_order_risk" });
      const risk = (data as { risk: ShopifyOrderRisk }).risk;
      return { content: [{ type: "text", text: JSON.stringify(risk, null, 2) }], structuredContent: risk };
    },

    create_order_risk: async (args) => {
      const { order_id, ...riskData } = CreateOrderRiskSchema.parse(args);
      const data = await logger.time("tool.create_order_risk", () =>
        client.post<{ risk: ShopifyOrderRisk }>(`/orders/${order_id}/risks.json`, { risk: riskData })
      , { tool: "create_order_risk" });
      const risk = (data as { risk: ShopifyOrderRisk }).risk;
      return { content: [{ type: "text", text: JSON.stringify(risk, null, 2) }], structuredContent: risk };
    },

    update_order_risk: async (args) => {
      const { order_id, risk_id, ...updateData } = UpdateOrderRiskSchema.parse(args);
      const data = await logger.time("tool.update_order_risk", () =>
        client.put<{ risk: ShopifyOrderRisk }>(`/orders/${order_id}/risks/${risk_id}.json`, { risk: updateData })
      , { tool: "update_order_risk" });
      const risk = (data as { risk: ShopifyOrderRisk }).risk;
      return { content: [{ type: "text", text: JSON.stringify(risk, null, 2) }], structuredContent: risk };
    },

    delete_order_risk: async (args) => {
      const { order_id, risk_id } = DeleteOrderRiskSchema.parse(args);
      await logger.time("tool.delete_order_risk", () =>
        client.delete<unknown>(`/orders/${order_id}/risks/${risk_id}.json`)
      , { tool: "delete_order_risk" });
      const response = { success: true, risk_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
