// Web Pixels tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_web_pixels, get_web_pixel, create_web_pixel, update_web_pixel, delete_web_pixel

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const GetWebPixelSchema = z.object({});

const CreateWebPixelSchema = z.object({
  settings: z.record(z.unknown()).describe("JSON settings object for the web pixel (app-defined configuration)"),
});

const UpdateWebPixelSchema = z.object({
  id: z.string().describe("Web pixel GID"),
  settings: z.record(z.unknown()).describe("Updated settings object"),
});

const DeleteWebPixelSchema = z.object({
  id: z.string().describe("Web pixel GID to delete"),
});

const ListCustomerPrivacyConsentSchema = z.object({
  customerId: z.string().describe("Customer GID to check privacy consent for"),
});

const UpdateCustomerConsentSchema = z.object({
  customerId: z.string().describe("Customer GID"),
  marketingConsent: z.object({
    marketingState: z.enum(["SUBSCRIBED", "UNSUBSCRIBED", "NOT_SUBSCRIBED", "PENDING"]).describe("Marketing consent state"),
    consentUpdatedAt: z.string().optional().describe("Consent update timestamp"),
    marketingOptInLevel: z.enum(["SINGLE_OPT_IN", "CONFIRMED_OPT_IN", "UNKNOWN"]).optional(),
  }).optional().describe("Marketing email consent"),
  smsMarketingConsent: z.object({
    marketingState: z.enum(["SUBSCRIBED", "UNSUBSCRIBED", "NOT_SUBSCRIBED", "PENDING"]).describe("SMS consent state"),
    consentUpdatedAt: z.string().optional(),
    marketingOptInLevel: z.enum(["SINGLE_OPT_IN", "CONFIRMED_OPT_IN", "UNKNOWN"]).optional(),
  }).optional().describe("SMS marketing consent"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_web_pixel",
      title: "Get Web Pixel",
      description: "Get the web pixel configuration for the app. Web pixels are custom JavaScript that runs on the storefront to track customer events. Returns the pixel's current settings.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_web_pixel",
      title: "Create Web Pixel",
      description: "Register a web pixel for the app. Web pixels run JavaScript in a sandbox on the storefront to track customer events (page views, add to cart, purchases). Provide settings as a JSON object.",
      inputSchema: {
        type: "object",
        properties: { settings: { type: "object", description: "JSON settings for the web pixel" } },
        required: ["settings"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_web_pixel",
      title: "Update Web Pixel",
      description: "Update the settings of an existing web pixel registration.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Web pixel GID" },
          settings: { type: "object", description: "Updated settings" },
        },
        required: ["id", "settings"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_web_pixel",
      title: "Delete Web Pixel",
      description: "Delete the web pixel registration. The pixel will stop running on the storefront.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Web pixel GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_customer_consent",
      title: "Get Customer Privacy Consent",
      description: "Get the privacy consent status for a customer — marketing email consent and SMS marketing consent. Returns consent state and opt-in level.",
      inputSchema: {
        type: "object",
        properties: { customerId: { type: "string", description: "Customer GID" } },
        required: ["customerId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "update_customer_consent",
      title: "Update Customer Privacy Consent",
      description: "Update a customer's marketing consent (email and/or SMS). Used to record consent collected outside Shopify (e.g. a custom sign-up form).",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer GID" },
          marketingConsent: { type: "object", description: "Email marketing consent {marketingState, marketingOptInLevel}" },
          smsMarketingConsent: { type: "object", description: "SMS marketing consent {marketingState, marketingOptInLevel}" },
        },
        required: ["customerId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown> = {}) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    get_web_pixel: async (_args) => {
      const q = `query{webPixel{id settings}}`;
      const data = await logger.time("tool.get_web_pixel", () => gql(q), { tool: "get_web_pixel" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_web_pixel: async (args) => {
      const { settings } = CreateWebPixelSchema.parse(args);
      const q = `mutation webPixelCreate($webPixel:WebPixelInput!){webPixelCreate(webPixel:$webPixel){webPixel{id settings}userErrors{field message}}}`;
      const data = await logger.time("tool.create_web_pixel", () =>
        gql(q, { webPixel: { settings: JSON.stringify(settings) } })
      , { tool: "create_web_pixel" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    update_web_pixel: async (args) => {
      const { id, settings } = UpdateWebPixelSchema.parse(args);
      const q = `mutation webPixelUpdate($id:ID!,$webPixel:WebPixelInput!){webPixelUpdate(id:$id,webPixel:$webPixel){webPixel{id settings}userErrors{field message}}}`;
      const data = await logger.time("tool.update_web_pixel", () =>
        gql(q, { id, webPixel: { settings: JSON.stringify(settings) } })
      , { tool: "update_web_pixel" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    delete_web_pixel: async (args) => {
      const { id } = DeleteWebPixelSchema.parse(args);
      const q = `mutation webPixelDelete($id:ID!){webPixelDelete(id:$id){deletedWebPixelId userErrors{field message}}}`;
      const data = await logger.time("tool.delete_web_pixel", () => gql(q, { id }), { tool: "delete_web_pixel" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_customer_consent: async (args) => {
      const { customerId } = ListCustomerPrivacyConsentSchema.parse(args);
      const q = `query($id:ID!){customer(id:$id){id displayName email emailMarketingConsent{marketingState marketingOptInLevel consentUpdatedAt}smsMarketingConsent{marketingState marketingOptInLevel consentUpdatedAt}}}`;
      const data = await logger.time("tool.get_customer_consent", () => gql(q, { id: customerId }), { tool: "get_customer_consent" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    update_customer_consent: async (args) => {
      const { customerId, marketingConsent, smsMarketingConsent } = UpdateCustomerConsentSchema.parse(args);
      const q = `mutation customerUpdateConsent($customerId:ID!,$input:CustomerEmailMarketingConsentUpdateInput!){customerEmailMarketingConsentUpdate(customerId:$customerId,emailMarketingConsent:$input){customer{id emailMarketingConsent{marketingState}}userErrors{field message}}}`;
      if (marketingConsent) {
        const data = await logger.time("tool.update_customer_consent", () =>
          gql(q, { customerId, input: marketingConsent })
        , { tool: "update_customer_consent" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
      }
      const smsQ = `mutation customerSmsConsentUpdate($customerId:ID!,$input:CustomerSmsMarketingConsentInput!){customerSmsMarketingConsentUpdate(input:{customerId:$customerId,smsMarketingConsent:$input}){customer{id smsMarketingConsent{marketingState}}userErrors{field message}}}`;
      const data = await logger.time("tool.update_customer_consent", () =>
        gql(smsQ, { customerId, input: smsMarketingConsent || {} })
      , { tool: "update_customer_consent" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
