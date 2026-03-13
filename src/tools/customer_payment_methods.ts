// Customer Payment Methods tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_customer_payment_methods, get_customer_payment_method, revoke_customer_payment_method, send_payment_method_update_email

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListCustomerPaymentMethodsSchema = z.object({
  customerId: z.string().describe("Customer GID (e.g. gid://shopify/Customer/123)"),
  first: z.number().min(1).max(100).optional().default(20),
  after: z.string().optional(),
  revokedReason: z.enum(["MERGED", "INVALID_USAGE_LIMIT", "USAGE_LIMIT_REACHED", "EXPIRED", "SHOPIFY_PAYMENTS_SETUP_REQUIRED"]).optional().describe("Filter by revocation reason"),
});

const GetCustomerPaymentMethodSchema = z.object({
  id: z.string().describe("Customer payment method GID"),
});

const RevokePaymentMethodSchema = z.object({
  customerPaymentMethodId: z.string().describe("Customer payment method GID to revoke"),
});

const SendUpdateEmailSchema = z.object({
  customerPaymentMethodId: z.string().describe("Customer payment method GID to send update email for"),
  email: z.string().email().optional().describe("Override email address (defaults to customer email)"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_customer_payment_methods",
      title: "List Customer Payment Methods",
      description: "List saved payment methods for a customer. Returns payment method GIDs, type (credit card, PayPal, etc.), last4 digits, expiry, and revocation status. Used for subscription billing.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer GID" },
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
          revokedReason: { type: "string", description: "Filter by revocation reason" },
        },
        required: ["customerId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_customer_payment_method",
      title: "Get Customer Payment Method",
      description: "Get a specific customer payment method by GID. Returns payment details, billing address, and whether it can be used for subscription billing.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Payment method GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "revoke_customer_payment_method",
      title: "Revoke Customer Payment Method",
      description: "Revoke a customer's saved payment method. Active subscriptions using this method will need to update their payment. Sends an email notification to the customer.",
      inputSchema: {
        type: "object",
        properties: { customerPaymentMethodId: { type: "string", description: "Payment method GID" } },
        required: ["customerPaymentMethodId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "send_payment_method_update_email",
      title: "Send Payment Method Update Email",
      description: "Send an email to a customer prompting them to update their saved payment method. Useful when a card is expiring or has been declined.",
      inputSchema: {
        type: "object",
        properties: {
          customerPaymentMethodId: { type: "string", description: "Payment method GID" },
          email: { type: "string", description: "Override email address" },
        },
        required: ["customerPaymentMethodId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown> = {}) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    list_customer_payment_methods: async (args) => {
      const { customerId, first, after, revokedReason } = ListCustomerPaymentMethodsSchema.parse(args);
      const q = `query($customerId:ID!,$first:Int!,$after:String,$revokedReason:CustomerPaymentMethodRevocationReason){customer(id:$customerId){paymentMethods(first:$first,after:$after,revokedReason:$revokedReason){edges{node{id revokedAt revokedReason instrument{... on CustomerCreditCard{brand lastDigits expiryMonth expiryYear} ... on CustomerPaypalBillingAgreement{paypalAccountEmail}}}}pageInfo{hasNextPage endCursor}}}}`;
      const data = await logger.time("tool.list_customer_payment_methods", () =>
        gql(q, { customerId, first, after, revokedReason })
      , { tool: "list_customer_payment_methods" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_customer_payment_method: async (args) => {
      const { id } = GetCustomerPaymentMethodSchema.parse(args);
      const q = `query($id:ID!){customerPaymentMethod(id:$id){id revokedAt revokedReason customer{id displayName email}instrument{... on CustomerCreditCard{brand lastDigits expiryMonth expiryYear billingAddress{address1 city country}} ... on CustomerPaypalBillingAgreement{paypalAccountEmail}}}}`;
      const data = await logger.time("tool.get_customer_payment_method", () => gql(q, { id }), { tool: "get_customer_payment_method" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    revoke_customer_payment_method: async (args) => {
      const { customerPaymentMethodId } = RevokePaymentMethodSchema.parse(args);
      const q = `mutation customerPaymentMethodRevoke($customerPaymentMethodId:ID!){customerPaymentMethodRevoke(customerPaymentMethodId:$customerPaymentMethodId){revokedCustomerPaymentMethodId userErrors{field message}}}`;
      const data = await logger.time("tool.revoke_customer_payment_method", () =>
        gql(q, { customerPaymentMethodId })
      , { tool: "revoke_customer_payment_method" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    send_payment_method_update_email: async (args) => {
      const { customerPaymentMethodId, email } = SendUpdateEmailSchema.parse(args);
      const q = `mutation customerPaymentMethodSendUpdateEmail($customerPaymentMethodId:ID!,$email:String){customerPaymentMethodSendUpdateEmail(customerPaymentMethodId:$customerPaymentMethodId,email:$email){customer{id email}userErrors{field message}}}`;
      const data = await logger.time("tool.send_payment_method_update_email", () =>
        gql(q, { customerPaymentMethodId, email })
      , { tool: "send_payment_method_update_email" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
