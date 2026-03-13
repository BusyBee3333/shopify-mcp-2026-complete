// Application Charges tools — Shopify Admin API 2024-01
// Covers: one-time application charges, recurring application charges, usage charges

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyApplicationCharge {
  id: number;
  name: string;
  price?: string;
  status?: string;
  return_url?: string;
  confirmation_url?: string;
  test?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyRecurringCharge {
  id: number;
  name: string;
  price?: string;
  status?: string;
  return_url?: string;
  confirmation_url?: string;
  billing_on?: string | null;
  activated_on?: string | null;
  cancelled_on?: string | null;
  trial_days?: number;
  trial_ends_on?: string | null;
  test?: boolean;
  capped_amount?: string | null;
  terms?: string | null;
  balance_used?: string;
  balance_remaining?: string;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyUsageCharge {
  id: number;
  description: string;
  price?: string;
  recurring_application_charge_id?: number;
  billing_on?: string | null;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const CreateApplicationChargeSchema = z.object({
  name: z.string().describe("Name of the charge shown to the merchant"),
  price: z.string().describe("Charge price (e.g. '9.99')"),
  return_url: z.string().url().describe("URL to redirect merchant after accepting/declining"),
  test: z.boolean().optional().describe("Set to true for test charges (won't bill)"),
});

const GetApplicationChargeSchema = z.object({ charge_id: z.string() });
const ActivateApplicationChargeSchema = z.object({ charge_id: z.string() });

const CreateRecurringChargeSchema = z.object({
  name: z.string().describe("Name of the subscription plan"),
  price: z.string().describe("Monthly price (e.g. '29.99')"),
  return_url: z.string().url().describe("URL to redirect merchant after accepting"),
  trial_days: z.number().optional().describe("Number of free trial days"),
  test: z.boolean().optional().describe("Set true for test (won't bill)"),
  capped_amount: z.string().optional().nullable().describe("Maximum monthly usage charge amount (for usage billing)"),
  terms: z.string().optional().nullable().describe("Description of usage charge terms"),
});

const GetRecurringChargeSchema = z.object({ charge_id: z.string() });
const ActivateRecurringChargeSchema = z.object({ charge_id: z.string() });
const DeleteRecurringChargeSchema = z.object({ charge_id: z.string() });

const ListUsageChargesSchema = z.object({ recurring_charge_id: z.string() });

const CreateUsageChargeSchema = z.object({
  recurring_charge_id: z.string(),
  description: z.string().describe("Description of what was charged"),
  price: z.string().describe("Amount to charge (e.g. '1.00')"),
});

const GetUsageChargeSchema = z.object({
  recurring_charge_id: z.string(),
  usage_charge_id: z.string(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "create_application_charge",
      title: "Create Application Charge (One-Time)",
      description: "Create a one-time application charge. The merchant must approve it via the confirmation_url. Use for single-purchase app features or setup fees.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "string" },
          return_url: { type: "string" },
          test: { type: "boolean" },
        },
        required: ["name", "price", "return_url"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_application_charge",
      title: "Get Application Charge",
      description: "Get the status of a one-time application charge. Check if merchant has accepted or declined.",
      inputSchema: {
        type: "object",
        properties: { charge_id: { type: "string" } },
        required: ["charge_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "activate_application_charge",
      title: "Activate Application Charge",
      description: "Activate an accepted one-time application charge to collect payment. Must be called after merchant accepts the charge.",
      inputSchema: {
        type: "object",
        properties: { charge_id: { type: "string" } },
        required: ["charge_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "create_recurring_application_charge",
      title: "Create Recurring Application Charge",
      description: "Create a recurring monthly application charge (subscription). The merchant must accept via the confirmation_url. Optionally include a trial period and usage caps.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "string" },
          return_url: { type: "string" },
          trial_days: { type: "number" },
          test: { type: "boolean" },
          capped_amount: { type: "string" },
          terms: { type: "string" },
        },
        required: ["name", "price", "return_url"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_recurring_application_charge",
      title: "Get Recurring Application Charge",
      description: "Get the status of a recurring application charge. Check if active, pending, cancelled, or declined.",
      inputSchema: {
        type: "object",
        properties: { charge_id: { type: "string" } },
        required: ["charge_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "activate_recurring_application_charge",
      title: "Activate Recurring Application Charge",
      description: "Activate an accepted recurring charge to start billing the merchant monthly.",
      inputSchema: {
        type: "object",
        properties: { charge_id: { type: "string" } },
        required: ["charge_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_recurring_application_charge",
      title: "Delete (Cancel) Recurring Application Charge",
      description: "Cancel an active recurring charge subscription. The merchant will no longer be billed.",
      inputSchema: {
        type: "object",
        properties: { charge_id: { type: "string" } },
        required: ["charge_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "list_usage_charges",
      title: "List Usage Charges",
      description: "List all usage charges applied to a recurring application charge. Usage charges bill merchants for metered usage on top of the base subscription.",
      inputSchema: {
        type: "object",
        properties: { recurring_charge_id: { type: "string" } },
        required: ["recurring_charge_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_usage_charge",
      title: "Create Usage Charge",
      description: "Apply a usage charge to a recurring application charge. Use for metered billing — charge merchants based on their actual usage (e.g. per order, per email sent).",
      inputSchema: {
        type: "object",
        properties: {
          recurring_charge_id: { type: "string" },
          description: { type: "string" },
          price: { type: "string" },
        },
        required: ["recurring_charge_id", "description", "price"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_usage_charge",
      title: "Get Usage Charge",
      description: "Get a specific usage charge by ID.",
      inputSchema: {
        type: "object",
        properties: {
          recurring_charge_id: { type: "string" },
          usage_charge_id: { type: "string" },
        },
        required: ["recurring_charge_id", "usage_charge_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    create_application_charge: async (args) => {
      const params = CreateApplicationChargeSchema.parse(args);
      const data = await logger.time("tool.create_application_charge", () =>
        client.post<{ application_charge: ShopifyApplicationCharge }>("/application_charges.json", { application_charge: params })
      , { tool: "create_application_charge" });
      const charge = (data as { application_charge: ShopifyApplicationCharge }).application_charge;
      return { content: [{ type: "text", text: JSON.stringify(charge, null, 2) }], structuredContent: charge };
    },

    get_application_charge: async (args) => {
      const { charge_id } = GetApplicationChargeSchema.parse(args);
      const data = await logger.time("tool.get_application_charge", () =>
        client.get<{ application_charge: ShopifyApplicationCharge }>(`/application_charges/${charge_id}.json`)
      , { tool: "get_application_charge" });
      const charge = (data as { application_charge: ShopifyApplicationCharge }).application_charge;
      return { content: [{ type: "text", text: JSON.stringify(charge, null, 2) }], structuredContent: charge };
    },

    activate_application_charge: async (args) => {
      const { charge_id } = ActivateApplicationChargeSchema.parse(args);
      const data = await logger.time("tool.activate_application_charge", () =>
        client.post<{ application_charge: ShopifyApplicationCharge }>(`/application_charges/${charge_id}/activate.json`, {})
      , { tool: "activate_application_charge" });
      const charge = (data as { application_charge: ShopifyApplicationCharge }).application_charge;
      return { content: [{ type: "text", text: JSON.stringify(charge, null, 2) }], structuredContent: charge };
    },

    create_recurring_application_charge: async (args) => {
      const params = CreateRecurringChargeSchema.parse(args);
      const data = await logger.time("tool.create_recurring_application_charge", () =>
        client.post<{ recurring_application_charge: ShopifyRecurringCharge }>("/recurring_application_charges.json", { recurring_application_charge: params })
      , { tool: "create_recurring_application_charge" });
      const charge = (data as { recurring_application_charge: ShopifyRecurringCharge }).recurring_application_charge;
      return { content: [{ type: "text", text: JSON.stringify(charge, null, 2) }], structuredContent: charge };
    },

    get_recurring_application_charge: async (args) => {
      const { charge_id } = GetRecurringChargeSchema.parse(args);
      const data = await logger.time("tool.get_recurring_application_charge", () =>
        client.get<{ recurring_application_charge: ShopifyRecurringCharge }>(`/recurring_application_charges/${charge_id}.json`)
      , { tool: "get_recurring_application_charge" });
      const charge = (data as { recurring_application_charge: ShopifyRecurringCharge }).recurring_application_charge;
      return { content: [{ type: "text", text: JSON.stringify(charge, null, 2) }], structuredContent: charge };
    },

    activate_recurring_application_charge: async (args) => {
      const { charge_id } = ActivateRecurringChargeSchema.parse(args);
      const data = await logger.time("tool.activate_recurring_application_charge", () =>
        client.post<{ recurring_application_charge: ShopifyRecurringCharge }>(`/recurring_application_charges/${charge_id}/activate.json`, {})
      , { tool: "activate_recurring_application_charge" });
      const charge = (data as { recurring_application_charge: ShopifyRecurringCharge }).recurring_application_charge;
      return { content: [{ type: "text", text: JSON.stringify(charge, null, 2) }], structuredContent: charge };
    },

    delete_recurring_application_charge: async (args) => {
      const { charge_id } = DeleteRecurringChargeSchema.parse(args);
      await logger.time("tool.delete_recurring_application_charge", () =>
        client.delete<unknown>(`/recurring_application_charges/${charge_id}.json`)
      , { tool: "delete_recurring_application_charge" });
      const response = { success: true, charge_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    list_usage_charges: async (args) => {
      const { recurring_charge_id } = ListUsageChargesSchema.parse(args);
      const data = await logger.time("tool.list_usage_charges", () =>
        client.get<{ usage_charges: ShopifyUsageCharge[] }>(`/recurring_application_charges/${recurring_charge_id}/usage_charges.json`)
      , { tool: "list_usage_charges" });
      const charges = (data as { usage_charges: ShopifyUsageCharge[] }).usage_charges;
      const response = { data: charges, meta: { count: charges.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    create_usage_charge: async (args) => {
      const { recurring_charge_id, ...chargeData } = CreateUsageChargeSchema.parse(args);
      const data = await logger.time("tool.create_usage_charge", () =>
        client.post<{ usage_charge: ShopifyUsageCharge }>(`/recurring_application_charges/${recurring_charge_id}/usage_charges.json`, { usage_charge: chargeData })
      , { tool: "create_usage_charge" });
      const charge = (data as { usage_charge: ShopifyUsageCharge }).usage_charge;
      return { content: [{ type: "text", text: JSON.stringify(charge, null, 2) }], structuredContent: charge };
    },

    get_usage_charge: async (args) => {
      const { recurring_charge_id, usage_charge_id } = GetUsageChargeSchema.parse(args);
      const data = await logger.time("tool.get_usage_charge", () =>
        client.get<{ usage_charge: ShopifyUsageCharge }>(`/recurring_application_charges/${recurring_charge_id}/usage_charges/${usage_charge_id}.json`)
      , { tool: "get_usage_charge" });
      const charge = (data as { usage_charge: ShopifyUsageCharge }).usage_charge;
      return { content: [{ type: "text", text: JSON.stringify(charge, null, 2) }], structuredContent: charge };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
