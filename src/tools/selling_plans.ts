// Selling Plans tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_selling_plan_groups, get_selling_plan_group, create_selling_plan_group, update_selling_plan_group, delete_selling_plan_group, add_products_to_selling_plan_group

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListSellingPlanGroupsSchema = z.object({
  first: z.number().min(1).max(250).optional().default(50).describe("Number of results"),
  after: z.string().optional().describe("Pagination cursor"),
  query: z.string().optional().describe("Filter query"),
});

const GetSellingPlanGroupSchema = z.object({
  id: z.string().describe("Selling plan group GID"),
});

const CreateSellingPlanGroupSchema = z.object({
  name: z.string().describe("Name of the selling plan group (e.g. 'Subscribe & Save')"),
  merchantCode: z.string().describe("Unique internal merchant code for the group"),
  description: z.string().optional().describe("Description shown to customers"),
  options: z.array(z.string()).describe("Plan option names (e.g. ['Delivery frequency'])"),
  sellingPlans: z.array(z.object({
    name: z.string().describe("Plan name (e.g. 'Deliver every week')"),
    options: z.array(z.string()).describe("Option values matching group options"),
    billingPolicy: z.object({
      recurring: z.object({
        interval: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]).describe("Billing interval"),
        intervalCount: z.number().describe("Number of intervals between billing"),
      }).optional(),
    }).optional().describe("Billing policy"),
    deliveryPolicy: z.object({
      recurring: z.object({
        interval: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]).describe("Delivery interval"),
        intervalCount: z.number().describe("Number of intervals between deliveries"),
      }).optional(),
    }).optional().describe("Delivery policy"),
    pricingPolicies: z.array(z.object({
      fixed: z.object({
        adjustmentType: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "PRICE"]).describe("Discount type"),
        adjustmentValue: z.object({
          percentage: z.number().optional().describe("Percentage off"),
          fixedValue: z.string().optional().describe("Fixed amount off"),
        }).describe("Adjustment value"),
      }).optional(),
    })).optional().describe("Pricing policies for the plan"),
  })).describe("Individual selling plans in the group"),
  productIds: z.array(z.string()).optional().describe("Product GIDs to associate with this group"),
  productVariantIds: z.array(z.string()).optional().describe("Variant GIDs to associate"),
});

const AddProductsToGroupSchema = z.object({
  id: z.string().describe("Selling plan group GID"),
  productIds: z.array(z.string()).optional().describe("Product GIDs to add"),
  productVariantIds: z.array(z.string()).optional().describe("Variant GIDs to add"),
});

const RemoveProductsFromGroupSchema = z.object({
  id: z.string().describe("Selling plan group GID"),
  productIds: z.array(z.string()).optional().describe("Product GIDs to remove"),
  productVariantIds: z.array(z.string()).optional().describe("Variant GIDs to remove"),
});

const DeleteSellingPlanGroupSchema = z.object({
  id: z.string().describe("Selling plan group GID to delete"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_selling_plan_groups",
      title: "List Selling Plan Groups",
      description: "List all subscription selling plan groups on the store. Selling plan groups define subscription options (e.g. 'Subscribe & Save' with weekly/monthly options). Returns group IDs, names, and plan counts.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "number", description: "Number of results (default 50)" },
          after: { type: "string", description: "Pagination cursor" },
          query: { type: "string", description: "Filter query" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_selling_plan_group",
      title: "Get Selling Plan Group",
      description: "Get a selling plan group by GID. Returns all selling plans, billing/delivery policies, pricing policies, and associated products.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Selling plan group GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_selling_plan_group",
      title: "Create Selling Plan Group",
      description: "Create a new subscription selling plan group with individual selling plans (e.g. weekly/monthly options). Each plan has billing policy, delivery policy, and pricing policy (discounts for subscribers).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Group name" },
          merchantCode: { type: "string", description: "Unique merchant code" },
          description: { type: "string", description: "Description" },
          options: { type: "array", description: "Option names" },
          sellingPlans: { type: "array", description: "Array of selling plan objects" },
          productIds: { type: "array", description: "Product GIDs to associate" },
          productVariantIds: { type: "array", description: "Variant GIDs to associate" },
        },
        required: ["name", "merchantCode", "options", "sellingPlans"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "add_products_to_selling_plan_group",
      title: "Add Products to Selling Plan Group",
      description: "Associate additional products or variants with a selling plan group, making subscription options available for those products.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Selling plan group GID" },
          productIds: { type: "array", description: "Product GIDs to add" },
          productVariantIds: { type: "array", description: "Variant GIDs to add" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "remove_products_from_selling_plan_group",
      title: "Remove Products from Selling Plan Group",
      description: "Remove products or variants from a selling plan group. Subscription options will no longer be available for the removed products.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Selling plan group GID" },
          productIds: { type: "array", description: "Product GIDs to remove" },
          productVariantIds: { type: "array", description: "Variant GIDs to remove" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_selling_plan_group",
      title: "Delete Selling Plan Group",
      description: "Delete a selling plan group and all its selling plans. Active subscriptions using these plans will be affected.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Selling plan group GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_selling_plan_groups: async (args) => {
      const { first, after, query } = ListSellingPlanGroupsSchema.parse(args);
      const gqlQuery = `
        query getSellingPlanGroups($first: Int!, $after: String, $query: String) {
          sellingPlanGroups(first: $first, after: $after, query: $query) {
            edges {
              node {
                id name merchantCode description
                sellingPlans(first: 20) {
                  edges { node { id name options } }
                }
                productCount
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await logger.time("tool.list_selling_plan_groups", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query: gqlQuery,
          variables: { first, after, query },
        })
      , { tool: "list_selling_plan_groups" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_selling_plan_group: async (args) => {
      const { id } = GetSellingPlanGroupSchema.parse(args);
      const query = `
        query getSellingPlanGroup($id: ID!) {
          sellingPlanGroup(id: $id) {
            id name merchantCode description options
            sellingPlans(first: 50) {
              edges {
                node {
                  id name options
                  billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } }
                  deliveryPolicy { ... on SellingPlanRecurringDeliveryPolicy { interval intervalCount } }
                  pricingPolicies {
                    ... on SellingPlanFixedPricingPolicy { adjustmentType adjustmentValue { ... on SellingPlanPricingPolicyPercentageValue { percentage } } }
                  }
                }
              }
            }
            products(first: 10) { edges { node { id title } } }
          }
        }
      `;
      const data = await logger.time("tool.get_selling_plan_group", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id } })
      , { tool: "get_selling_plan_group" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_selling_plan_group: async (args) => {
      const { productIds, productVariantIds, ...groupData } = CreateSellingPlanGroupSchema.parse(args);
      const query = `
        mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
          sellingPlanGroupCreate(input: $input, resources: $resources) {
            sellingPlanGroup { id name merchantCode }
            userErrors { field message code }
          }
        }
      `;
      const resources = (productIds || productVariantIds) ? { productIds, productVariantIds } : undefined;
      const data = await logger.time("tool.create_selling_plan_group", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { input: groupData, resources },
        })
      , { tool: "create_selling_plan_group" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    add_products_to_selling_plan_group: async (args) => {
      const { id, productIds, productVariantIds } = AddProductsToGroupSchema.parse(args);
      const query = `
        mutation sellingPlanGroupAddProducts($id: ID!, $productIds: [ID!], $productVariantIds: [ID!]) {
          sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
            sellingPlanGroup { id name productCount }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.add_products_to_selling_plan_group", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { id, productIds, productVariantIds },
        })
      , { tool: "add_products_to_selling_plan_group" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    remove_products_from_selling_plan_group: async (args) => {
      const { id, productIds, productVariantIds } = RemoveProductsFromGroupSchema.parse(args);
      const query = `
        mutation sellingPlanGroupRemoveProducts($id: ID!, $productIds: [ID!]) {
          sellingPlanGroupRemoveProducts(id: $id, productIds: $productIds) {
            removedProductIds
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.remove_products_from_selling_plan_group", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { id, productIds, productVariantIds },
        })
      , { tool: "remove_products_from_selling_plan_group" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    delete_selling_plan_group: async (args) => {
      const { id } = DeleteSellingPlanGroupSchema.parse(args);
      const query = `
        mutation sellingPlanGroupDelete($id: ID!) {
          sellingPlanGroupDelete(id: $id) {
            deletedSellingPlanGroupId
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.delete_selling_plan_group", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id } })
      , { tool: "delete_selling_plan_group" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
