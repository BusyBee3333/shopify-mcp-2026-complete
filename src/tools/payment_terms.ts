// Payment Terms tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_payment_terms_templates, get_payment_terms, create_payment_terms, delete_payment_terms

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListPaymentTermsTemplatesSchema = z.object({});

const GetPaymentTermsSchema = z.object({
  orderId: z.string().describe("Order GID to get payment terms for (e.g. gid://shopify/Order/123)"),
});

const CreatePaymentTermsSchema = z.object({
  referenceId: z.string().describe("GID of the order or draft order to apply payment terms to"),
  paymentTermsTemplateId: z.string().describe("GID of the payment terms template to use (from list_payment_terms_templates)"),
  paymentSchedules: z.array(z.object({
    amount: z.string().optional().describe("Payment amount"),
    currency: z.string().optional().describe("Currency code"),
    issuedAt: z.string().optional().describe("Issue date (ISO 8601)"),
    dueAt: z.string().optional().describe("Due date (ISO 8601)"),
  })).optional().describe("Custom payment schedule overrides"),
});

const DeletePaymentTermsSchema = z.object({
  paymentTermsId: z.string().describe("GID of the payment terms to delete"),
});

const SendPaymentReminderSchema = z.object({
  paymentScheduleId: z.string().describe("GID of the payment schedule to send reminder for"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_payment_terms_templates",
      title: "List Payment Terms Templates",
      description: "List available payment terms templates (NET_30, NET_60, RECEIPT, FIXED, etc.). Returns template IDs, names, payment schedule type, and due dates. Use to find the right template ID before creating payment terms.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_payment_terms",
      title: "Get Order Payment Terms",
      description: "Get payment terms and payment schedule for a specific order. Returns the payment terms template name, due dates, and payment status for each scheduled payment.",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string", description: "Order GID" } },
        required: ["orderId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_payment_terms",
      title: "Create Payment Terms",
      description: "Attach payment terms to an order or draft order using a template (NET_30, NET_60, etc.). Creates a structured payment schedule with due dates. Used for B2B/wholesale invoice-based selling.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Order or DraftOrder GID" },
          paymentTermsTemplateId: { type: "string", description: "Payment terms template GID" },
          paymentSchedules: { type: "array", description: "Optional custom payment schedule overrides" },
        },
        required: ["referenceId", "paymentTermsTemplateId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_payment_terms",
      title: "Delete Payment Terms",
      description: "Remove payment terms from an order. The order will no longer have structured payment schedules or NET terms.",
      inputSchema: {
        type: "object",
        properties: { paymentTermsId: { type: "string", description: "Payment terms GID" } },
        required: ["paymentTermsId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "send_payment_reminder",
      title: "Send Payment Reminder",
      description: "Send a payment reminder email to the customer for a specific payment schedule that is overdue or upcoming.",
      inputSchema: {
        type: "object",
        properties: { paymentScheduleId: { type: "string", description: "Payment schedule GID" } },
        required: ["paymentScheduleId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_payment_terms_templates: async (_args) => {
      const query = `
        query {
          paymentTermsTemplates {
            id
            name
            paymentTermsType
            dueInDays
            description
            translatedName
          }
        }
      `;
      const data = await logger.time("tool.list_payment_terms_templates", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query })
      , { tool: "list_payment_terms_templates" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_payment_terms: async (args) => {
      const { orderId } = GetPaymentTermsSchema.parse(args);
      const query = `
        query getPaymentTerms($id: ID!) {
          order(id: $id) {
            id
            paymentTerms {
              id
              paymentTermsName
              paymentTermsType
              dueInDays
              overdue
              paymentSchedules(first: 20) {
                edges {
                  node {
                    id
                    amount { amount currencyCode }
                    dueAt
                    issuedAt
                    completedAt
                  }
                }
              }
            }
          }
        }
      `;
      const data = await logger.time("tool.get_payment_terms", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id: orderId } })
      , { tool: "get_payment_terms" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_payment_terms: async (args) => {
      const { referenceId, paymentTermsTemplateId, paymentSchedules } = CreatePaymentTermsSchema.parse(args);
      const query = `
        mutation paymentTermsCreate($referenceId: ID!, $paymentTermsAttributes: PaymentTermsCreateInput!) {
          paymentTermsCreate(referenceId: $referenceId, paymentTermsAttributes: $paymentTermsAttributes) {
            paymentTerms {
              id
              paymentTermsName
              paymentTermsType
              dueInDays
            }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.create_payment_terms", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: {
            referenceId,
            paymentTermsAttributes: { paymentTermsTemplateId, paymentSchedules },
          },
        })
      , { tool: "create_payment_terms" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    delete_payment_terms: async (args) => {
      const { paymentTermsId } = DeletePaymentTermsSchema.parse(args);
      const query = `
        mutation paymentTermsDelete($input: PaymentTermsDeleteInput!) {
          paymentTermsDelete(input: $input) {
            deletedId
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.delete_payment_terms", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { input: { paymentTermsId } },
        })
      , { tool: "delete_payment_terms" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    send_payment_reminder: async (args) => {
      const { paymentScheduleId } = SendPaymentReminderSchema.parse(args);
      const query = `
        mutation paymentReminderSend($paymentScheduleId: ID!) {
          paymentReminderSend(paymentScheduleId: $paymentScheduleId) {
            success
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.send_payment_reminder", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { paymentScheduleId },
        })
      , { tool: "send_payment_reminder" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
