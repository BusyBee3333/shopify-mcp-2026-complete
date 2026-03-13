// Resource Feedback tools — Shopify Admin API 2024-01
// Covers: list_resource_feedback, create_resource_feedback, delete_resource_feedback

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyResourceFeedback {
  created_at?: string;
  updated_at?: string;
  resource_id?: number;
  resource_type?: string;
  resource_updated_at?: string;
  messages?: string[];
  feedback_generated_at?: string;
  state?: string;
}

// === Zod Schemas ===
const ListResourceFeedbackSchema = z.object({});

const CreateResourceFeedbackSchema = z.object({
  resource_id: z.number().describe("ID of the resource (e.g. product ID, shop ID)"),
  resource_type: z.string().describe("Type of resource (e.g. 'Shop', 'Product')"),
  resource_updated_at: z.string().describe("ISO8601 datetime the resource was last updated"),
  messages: z.array(z.string()).describe("Array of feedback messages for the merchant"),
  feedback_generated_at: z.string().describe("ISO8601 datetime when feedback was generated"),
  state: z.enum(["requires_action", "success"]).describe("Feedback state — 'requires_action' shows a notice to merchant"),
});

const DeleteResourceFeedbackSchema = z.object({
  resource_id: z.number(),
  resource_type: z.string(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_resource_feedback",
      title: "List Resource Feedback",
      description: "List all resource feedback submitted by this app. Resource feedback lets apps communicate status messages to merchants in the Shopify admin.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_resource_feedback",
      title: "Create Resource Feedback",
      description: "Create a resource feedback message that appears in the Shopify admin. Use state='requires_action' to show an action notice, 'success' to indicate everything is set up correctly.",
      inputSchema: {
        type: "object",
        properties: {
          resource_id: { type: "number" },
          resource_type: { type: "string", description: "e.g. 'Shop', 'Product'" },
          resource_updated_at: { type: "string" },
          messages: { type: "array", items: { type: "string" } },
          feedback_generated_at: { type: "string" },
          state: { type: "string", enum: ["requires_action", "success"] },
        },
        required: ["resource_id", "resource_type", "resource_updated_at", "messages", "feedback_generated_at", "state"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_resource_feedback",
      title: "Delete Resource Feedback",
      description: "Remove a resource feedback message. Use this when the issue has been resolved and you no longer need to show the merchant a notice.",
      inputSchema: {
        type: "object",
        properties: {
          resource_id: { type: "number" },
          resource_type: { type: "string" },
        },
        required: ["resource_id", "resource_type"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_resource_feedback: async (_args) => {
      const data = await logger.time("tool.list_resource_feedback", () =>
        client.get<{ resource_feedback: ShopifyResourceFeedback[] }>("/resource_feedback.json")
      , { tool: "list_resource_feedback" });
      const feedback = (data as { resource_feedback: ShopifyResourceFeedback[] }).resource_feedback;
      const response = { data: feedback, meta: { count: feedback.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    create_resource_feedback: async (args) => {
      const params = CreateResourceFeedbackSchema.parse(args);
      const data = await logger.time("tool.create_resource_feedback", () =>
        client.post<{ resource_feedback: ShopifyResourceFeedback }>("/resource_feedback.json", { resource_feedback: params })
      , { tool: "create_resource_feedback" });
      const feedback = (data as { resource_feedback: ShopifyResourceFeedback }).resource_feedback;
      return { content: [{ type: "text", text: JSON.stringify(feedback, null, 2) }], structuredContent: feedback };
    },

    delete_resource_feedback: async (args) => {
      const { resource_id, resource_type } = DeleteResourceFeedbackSchema.parse(args);
      await logger.time("tool.delete_resource_feedback", () =>
        client.delete<unknown>(`/resource_feedback.json?resource_id=${resource_id}&resource_type=${encodeURIComponent(resource_type)}`)
      , { tool: "delete_resource_feedback" });
      const response = { success: true, resource_id, resource_type };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
