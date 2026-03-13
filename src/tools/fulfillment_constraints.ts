// Fulfillment Constraints tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_fulfillment_constraint_rules, create_fulfillment_constraint_rule, delete_fulfillment_constraint_rule

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListFulfillmentConstraintRulesSchema = z.object({});

const CreateFulfillmentConstraintRuleSchema = z.object({
  callbackUrl: z.string().url().describe("URL that Shopify calls to evaluate fulfillment constraints"),
  fulfillmentServiceId: z.string().optional().describe("GID of the fulfillment service this rule applies to"),
  metafieldId: z.string().optional().describe("Metafield GID for constraint data"),
});

const DeleteFulfillmentConstraintRuleSchema = z.object({
  fulfillmentConstraintRuleId: z.string().describe("Fulfillment constraint rule GID to delete"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_fulfillment_constraint_rules",
      title: "List Fulfillment Constraint Rules",
      description: "List all fulfillment constraint rules registered on the store. Constraint rules define custom logic (via callbacks) that determines which fulfillment locations can fulfill an order.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_fulfillment_constraint_rule",
      title: "Create Fulfillment Constraint Rule",
      description: "Register a new fulfillment constraint rule with a callback URL. Shopify calls this URL during checkout to determine available fulfillment locations based on cart contents.",
      inputSchema: {
        type: "object",
        properties: {
          callbackUrl: { type: "string", description: "Callback URL for constraint evaluation" },
          fulfillmentServiceId: { type: "string", description: "Fulfillment service GID" },
          metafieldId: { type: "string", description: "Metafield GID for constraint data" },
        },
        required: ["callbackUrl"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_fulfillment_constraint_rule",
      title: "Delete Fulfillment Constraint Rule",
      description: "Delete a fulfillment constraint rule. Shopify will no longer call the callback for fulfillment location decisions.",
      inputSchema: {
        type: "object",
        properties: { fulfillmentConstraintRuleId: { type: "string", description: "Constraint rule GID" } },
        required: ["fulfillmentConstraintRuleId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown> = {}) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    list_fulfillment_constraint_rules: async (_args) => {
      const q = `query{fulfillmentConstraintRules{id callbackUrl createdAt updatedAt}}`;
      const data = await logger.time("tool.list_fulfillment_constraint_rules", () => gql(q), { tool: "list_fulfillment_constraint_rules" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_fulfillment_constraint_rule: async (args) => {
      const params = CreateFulfillmentConstraintRuleSchema.parse(args);
      const q = `mutation fulfillmentConstraintRuleCreate($fulfillmentConstraintRule:FulfillmentConstraintRuleInput!){fulfillmentConstraintRuleCreate(fulfillmentConstraintRule:$fulfillmentConstraintRule){fulfillmentConstraintRule{id callbackUrl}userErrors{field message}}}`;
      const data = await logger.time("tool.create_fulfillment_constraint_rule", () =>
        gql(q, { fulfillmentConstraintRule: params })
      , { tool: "create_fulfillment_constraint_rule" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    delete_fulfillment_constraint_rule: async (args) => {
      const { fulfillmentConstraintRuleId } = DeleteFulfillmentConstraintRuleSchema.parse(args);
      const q = `mutation fulfillmentConstraintRuleDelete($id:ID!){fulfillmentConstraintRuleDelete(id:$id){deletedId userErrors{field message}}}`;
      const data = await logger.time("tool.delete_fulfillment_constraint_rule", () =>
        gql(q, { id: fulfillmentConstraintRuleId })
      , { tool: "delete_fulfillment_constraint_rule" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
