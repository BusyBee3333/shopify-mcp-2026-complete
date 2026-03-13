// Subscription Contracts tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_subscription_contracts, get_subscription_contract, update_subscription_contract, subscription_contract_activate, subscription_contract_cancel, subscription_billing_attempt_create

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListSubscriptionContractsSchema = z.object({
  first: z.number().min(1).max(250).optional().default(50).describe("Number of results"),
  after: z.string().optional().describe("Pagination cursor"),
});

const GetSubscriptionContractSchema = z.object({
  id: z.string().describe("Subscription contract GID"),
});

const UpdateSubscriptionContractSchema = z.object({
  contractId: z.string().describe("Subscription contract GID to update"),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED", "FAILED"]).optional().describe("New contract status"),
  nextBillingDate: z.string().optional().describe("Next billing date (ISO 8601)"),
});

const ActivateContractSchema = z.object({
  subscriptionContractId: z.string().describe("Subscription contract GID to activate"),
});

const CancelContractSchema = z.object({
  subscriptionContractId: z.string().describe("Subscription contract GID to cancel"),
});

const BillingAttemptSchema = z.object({
  subscriptionContractId: z.string().describe("Subscription contract GID to bill"),
  originTime: z.string().optional().describe("Override billing date (ISO 8601)"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate billing attempts"),
});

const GetBillingAttemptSchema = z.object({
  id: z.string().describe("Billing attempt GID"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_subscription_contracts",
      title: "List Subscription Contracts",
      description: "List all subscription billing contracts on the store. Returns contract GIDs, status (ACTIVE/PAUSED/CANCELLED), customer info, next billing date, and line items.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "number", description: "Number of results (default 50)" },
          after: { type: "string", description: "Pagination cursor" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_subscription_contract",
      title: "Get Subscription Contract",
      description: "Get a specific subscription contract by GID. Returns full details including customer, line items, billing policy, delivery policy, and next billing date.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Subscription contract GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "update_subscription_contract",
      title: "Update Subscription Contract",
      description: "Update a subscription contract status or next billing date. Use to pause, reactivate, or reschedule a subscription contract.",
      inputSchema: {
        type: "object",
        properties: {
          contractId: { type: "string", description: "Subscription contract GID" },
          status: { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED", "FAILED"], description: "New status" },
          nextBillingDate: { type: "string", description: "Next billing date (ISO 8601)" },
        },
        required: ["contractId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "activate_subscription_contract",
      title: "Activate Subscription Contract",
      description: "Activate a paused or previously cancelled subscription contract.",
      inputSchema: {
        type: "object",
        properties: { subscriptionContractId: { type: "string", description: "Subscription contract GID" } },
        required: ["subscriptionContractId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "cancel_subscription_contract",
      title: "Cancel Subscription Contract",
      description: "Cancel an active subscription contract. The customer will no longer be billed.",
      inputSchema: {
        type: "object",
        properties: { subscriptionContractId: { type: "string", description: "Subscription contract GID" } },
        required: ["subscriptionContractId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_subscription_billing_attempt",
      title: "Create Subscription Billing Attempt",
      description: "Trigger an immediate billing attempt for a subscription contract. Creates an order if successful. Use for dunning (retrying failed payments) or billing ahead of schedule.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionContractId: { type: "string", description: "Subscription contract GID" },
          originTime: { type: "string", description: "Override billing date (ISO 8601)" },
          idempotencyKey: { type: "string", description: "Idempotency key to prevent duplicates" },
        },
        required: ["subscriptionContractId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_subscription_billing_attempt",
      title: "Get Subscription Billing Attempt",
      description: "Get the result of a subscription billing attempt. Returns status (PENDING/SUCCESS/FAILED), the created order GID if successful, and error code/message if failed.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Billing attempt GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_subscription_contracts: async (args) => {
      const { first, after } = ListSubscriptionContractsSchema.parse(args);
      const query = `
        query getSubscriptionContracts($first: Int!, $after: String) {
          subscriptionContracts(first: $first, after: $after) {
            edges {
              node {
                id status nextBillingDate
                customer { id displayName email }
                lines(first: 5) { edges { node { id productDetails { productId variantId productTitle } quantity } } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await logger.time("tool.list_subscription_contracts", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { first, after } })
      , { tool: "list_subscription_contracts" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_subscription_contract: async (args) => {
      const { id } = GetSubscriptionContractSchema.parse(args);
      const query = `
        query getSubscriptionContract($id: ID!) {
          subscriptionContract(id: $id) {
            id status nextBillingDate createdAt updatedAt
            customer { id displayName email }
            customerPaymentMethod { id }
            billingPolicy { interval intervalCount minCycles maxCycles }
            deliveryPolicy { interval intervalCount }
            deliveryPrice { amount currencyCode }
            lines(first: 50) {
              edges {
                node {
                  id quantity currentPrice { amount currencyCode }
                  productDetails { productId variantId productTitle variantTitle }
                }
              }
            }
          }
        }
      `;
      const data = await logger.time("tool.get_subscription_contract", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id } })
      , { tool: "get_subscription_contract" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    update_subscription_contract: async (args) => {
      const { contractId, ...input } = UpdateSubscriptionContractSchema.parse(args);
      const query = `
        mutation subscriptionContractUpdate($contractId: ID!, $input: SubscriptionContractUpdateInput!) {
          subscriptionContractUpdate(contractId: $contractId, input: $input) {
            draft { id }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.update_subscription_contract", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { contractId, input } })
      , { tool: "update_subscription_contract" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    activate_subscription_contract: async (args) => {
      const { subscriptionContractId } = ActivateContractSchema.parse(args);
      const query = `
        mutation subscriptionContractActivate($subscriptionContractId: ID!) {
          subscriptionContractActivate(subscriptionContractId: $subscriptionContractId) {
            contract { id status }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.activate_subscription_contract", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { subscriptionContractId } })
      , { tool: "activate_subscription_contract" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    cancel_subscription_contract: async (args) => {
      const { subscriptionContractId } = CancelContractSchema.parse(args);
      const query = `
        mutation subscriptionContractCancel($subscriptionContractId: ID!) {
          subscriptionContractCancel(subscriptionContractId: $subscriptionContractId) {
            contract { id status }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.cancel_subscription_contract", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { subscriptionContractId } })
      , { tool: "cancel_subscription_contract" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_subscription_billing_attempt: async (args) => {
      const { subscriptionContractId, originTime, idempotencyKey } = BillingAttemptSchema.parse(args);
      const query = `
        mutation subscriptionBillingAttemptCreate($subscriptionContractId: ID!, $originTime: DateTime, $idempotencyKey: String) {
          subscriptionBillingAttemptCreate(subscriptionContractId: $subscriptionContractId, originTime: $originTime, idempotencyKey: $idempotencyKey) {
            subscriptionBillingAttempt {
              id
              ready
              errorCode
              errorMessage
              order { id name }
            }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.create_subscription_billing_attempt", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { subscriptionContractId, originTime, idempotencyKey },
        })
      , { tool: "create_subscription_billing_attempt" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_subscription_billing_attempt: async (args) => {
      const { id } = GetBillingAttemptSchema.parse(args);
      const query = `
        query getSubscriptionBillingAttempt($id: ID!) {
          subscriptionBillingAttempt(id: $id) {
            id
            ready
            errorCode
            errorMessage
            subscriptionContract { id status }
            order { id name totalPriceSet { shopMoney { amount currencyCode } } }
          }
        }
      `;
      const data = await logger.time("tool.get_subscription_billing_attempt", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id } })
      , { tool: "get_subscription_billing_attempt" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
