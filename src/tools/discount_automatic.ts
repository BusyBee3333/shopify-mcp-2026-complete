// Discount Automatic tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_automatic_discounts, get_automatic_discount, create_automatic_basic_discount, create_automatic_bxgy_discount, update_automatic_discount, delete_automatic_discount, activate_automatic_discount, deactivate_automatic_discount

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListAutomaticDiscountsSchema = z.object({
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
  query: z.string().optional().describe("Filter by title or status"),
  sortKey: z.enum(["TITLE", "CREATED_AT", "UPDATED_AT", "STARTS_AT", "ENDS_AT"]).optional(),
});

const GetAutomaticDiscountSchema = z.object({
  id: z.string().describe("Automatic discount GID"),
});

const CreateAutomaticBasicDiscountSchema = z.object({
  title: z.string().describe("Discount title (visible to customers)"),
  startsAt: z.string().describe("Start date/time (ISO 8601)"),
  endsAt: z.string().optional().describe("End date/time (ISO 8601), omit for no expiry"),
  customerGets: z.object({
    value: z.object({
      discountAmount: z.object({
        amount: z.string().describe("Fixed discount amount"),
        currencyCode: z.string().describe("Currency code"),
        appliesOnEachItem: z.boolean().optional().describe("Apply to each item individually"),
      }).optional().describe("Fixed amount off"),
      percentage: z.number().optional().describe("Percentage off (0-1, e.g. 0.1 for 10%)"),
    }).describe("Discount value"),
    items: z.object({
      all: z.boolean().optional().describe("Apply to all items"),
      products: z.object({
        productsToAdd: z.array(z.string()).optional().describe("Product GIDs"),
        productVariantsToAdd: z.array(z.string()).optional().describe("Variant GIDs"),
      }).optional().describe("Specific products"),
      collections: z.object({
        add: z.array(z.string()).optional().describe("Collection GIDs"),
      }).optional().describe("Specific collections"),
    }).describe("Items the discount applies to"),
  }).describe("What the customer gets (the discount)"),
  minimumRequirement: z.object({
    quantity: z.object({
      greaterThanOrEqualToQuantity: z.string().describe("Minimum quantity"),
    }).optional().describe("Minimum quantity requirement"),
    subtotal: z.object({
      greaterThanOrEqualToSubtotal: z.string().describe("Minimum subtotal"),
    }).optional().describe("Minimum subtotal requirement"),
  }).optional().describe("Minimum purchase requirement"),
  combinesWith: z.object({
    orderDiscounts: z.boolean().optional().default(false),
    productDiscounts: z.boolean().optional().default(false),
    shippingDiscounts: z.boolean().optional().default(false),
  }).optional().describe("Whether this discount can be combined with others"),
});

const CreateAutomaticBxgyDiscountSchema = z.object({
  title: z.string().describe("Discount title"),
  startsAt: z.string().describe("Start date/time (ISO 8601)"),
  endsAt: z.string().optional().describe("End date/time"),
  customerBuys: z.object({
    value: z.object({
      quantity: z.string().optional().describe("Quantity to buy"),
      amount: z.string().optional().describe("Amount to spend"),
    }).describe("Buy condition"),
    items: z.object({
      all: z.boolean().optional(),
      products: z.object({
        productsToAdd: z.array(z.string()).optional(),
        productVariantsToAdd: z.array(z.string()).optional(),
      }).optional(),
      collections: z.object({ add: z.array(z.string()).optional() }).optional(),
    }).describe("Products customer must buy"),
  }).describe("Buy X condition"),
  customerGets: z.object({
    value: z.object({
      discountOnQuantity: z.object({
        quantity: z.string().describe("Quantity customer gets"),
        effect: z.object({
          percentage: z.number().optional().describe("Percentage off (0-1)"),
          discountAmount: z.object({ amount: z.string(), currencyCode: z.string() }).optional(),
        }).describe("Discount applied to got items"),
      }).optional(),
    }).describe("Get Y benefit"),
    items: z.object({
      all: z.boolean().optional(),
      products: z.object({
        productsToAdd: z.array(z.string()).optional(),
        productVariantsToAdd: z.array(z.string()).optional(),
      }).optional(),
      collections: z.object({ add: z.array(z.string()).optional() }).optional(),
    }).describe("Products customer gets"),
  }).describe("Get Y items"),
  usesPerOrderLimit: z.string().optional().describe("Maximum uses per order"),
});

const UpdateAutomaticDiscountSchema = z.object({
  id: z.string().describe("Automatic discount GID"),
  title: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional().nullable(),
});

const DeleteAutomaticDiscountSchema = z.object({
  id: z.string().describe("Automatic discount GID to delete"),
});

const ActivateDiscountSchema = z.object({
  id: z.string().describe("Automatic discount GID to activate"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_automatic_discounts",
      title: "List Automatic Discounts",
      description: "List all automatic discounts on the store. Automatic discounts apply to carts that meet criteria without requiring a code. Returns GIDs, titles, status, and date ranges.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
          query: { type: "string", description: "Filter by title or status" },
          sortKey: { type: "string", enum: ["TITLE", "CREATED_AT", "UPDATED_AT", "STARTS_AT", "ENDS_AT"] },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_automatic_discount",
      title: "Get Automatic Discount",
      description: "Get details of an automatic discount by GID. Returns type (basic/bxgy/free_shipping), status, conditions, what the customer gets, and usage count.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Automatic discount GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_automatic_basic_discount",
      title: "Create Automatic Basic Discount",
      description: "Create an automatic discount that applies a fixed amount or percentage off. No code required — triggers automatically when cart meets conditions. Supports minimum quantity/subtotal requirements and product/collection targeting.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Discount title" },
          startsAt: { type: "string", description: "Start date (ISO 8601)" },
          endsAt: { type: "string", description: "End date (ISO 8601)" },
          customerGets: { type: "object", description: "Discount value and items it applies to" },
          minimumRequirement: { type: "object", description: "Minimum quantity or subtotal" },
          combinesWith: { type: "object", description: "Combination rules with other discounts" },
        },
        required: ["title", "startsAt", "customerGets"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "create_automatic_bxgy_discount",
      title: "Create Automatic Buy X Get Y Discount",
      description: "Create an automatic Buy X Get Y discount. Customer buys a specified quantity/amount of products and automatically gets a discount on other products. No code required.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Discount title" },
          startsAt: { type: "string", description: "Start date (ISO 8601)" },
          endsAt: { type: "string", description: "End date (ISO 8601)" },
          customerBuys: { type: "object", description: "Buy X condition" },
          customerGets: { type: "object", description: "Get Y benefit" },
          usesPerOrderLimit: { type: "string", description: "Max uses per order" },
        },
        required: ["title", "startsAt", "customerBuys", "customerGets"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_automatic_discount",
      title: "Update Automatic Discount",
      description: "Update the title or date range of an automatic discount.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Automatic discount GID" },
          title: { type: "string", description: "New title" },
          startsAt: { type: "string", description: "New start date" },
          endsAt: { type: "string", description: "New end date (null to remove)" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_automatic_discount",
      title: "Delete Automatic Discount",
      description: "Permanently delete an automatic discount. Active carts using this discount will lose the discount on next calculation.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Automatic discount GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "activate_automatic_discount",
      title: "Activate Automatic Discount",
      description: "Activate a deactivated automatic discount, making it live.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Automatic discount GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "deactivate_automatic_discount",
      title: "Deactivate Automatic Discount",
      description: "Deactivate an active automatic discount without deleting it. Can be reactivated later.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Automatic discount GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown> = {}) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    list_automatic_discounts: async (args) => {
      const { first, after, query, sortKey } = ListAutomaticDiscountsSchema.parse(args);
      const q = `query($first:Int!,$after:String,$query:String,$sortKey:AutomaticDiscountSortKeys){automaticDiscountNodes(first:$first,after:$after,query:$query,sortKey:$sortKey){edges{node{id automaticDiscount{... on DiscountAutomaticBasic{title status startsAt endsAt asyncUsageCount}... on DiscountAutomaticBxgy{title status startsAt endsAt asyncUsageCount}}}}pageInfo{hasNextPage endCursor}}}`;
      const data = await logger.time("tool.list_automatic_discounts", () =>
        gql(q, { first, after, query, sortKey })
      , { tool: "list_automatic_discounts" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_automatic_discount: async (args) => {
      const { id } = GetAutomaticDiscountSchema.parse(args);
      const q = `query($id:ID!){automaticDiscountNode(id:$id){id automaticDiscount{... on DiscountAutomaticBasic{title status startsAt endsAt asyncUsageCount customerGets{value{... on DiscountAmount{amount{amount currencyCode}}... on DiscountPercentage{percentage}}items{... on AllDiscountItems{allItems}... on DiscountProducts{products(first:5){edges{node{id title}}}}}}minimumRequirement{... on DiscountMinimumQuantity{greaterThanOrEqualToQuantity}... on DiscountMinimumSubtotal{greaterThanOrEqualToSubtotal{amount}}}}... on DiscountAutomaticBxgy{title status startsAt endsAt asyncUsageCount}}}}`;
      const data = await logger.time("tool.get_automatic_discount", () => gql(q, { id }), { tool: "get_automatic_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_automatic_basic_discount: async (args) => {
      const params = CreateAutomaticBasicDiscountSchema.parse(args);
      const q = `mutation discountAutomaticBasicCreate($automaticBasicDiscount:DiscountAutomaticBasicInput!){discountAutomaticBasicCreate(automaticBasicDiscount:$automaticBasicDiscount){automaticDiscountNode{id automaticDiscount{... on DiscountAutomaticBasic{title status}}}userErrors{field message code}}}`;
      const data = await logger.time("tool.create_automatic_basic_discount", () =>
        gql(q, { automaticBasicDiscount: params })
      , { tool: "create_automatic_basic_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_automatic_bxgy_discount: async (args) => {
      const params = CreateAutomaticBxgyDiscountSchema.parse(args);
      const q = `mutation discountAutomaticBxgyCreate($automaticBxgyDiscount:DiscountAutomaticBxgyInput!){discountAutomaticBxgyCreate(automaticBxgyDiscount:$automaticBxgyDiscount){automaticDiscountNode{id automaticDiscount{... on DiscountAutomaticBxgy{title status}}}userErrors{field message code}}}`;
      const data = await logger.time("tool.create_automatic_bxgy_discount", () =>
        gql(q, { automaticBxgyDiscount: params })
      , { tool: "create_automatic_bxgy_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    update_automatic_discount: async (args) => {
      const { id, ...input } = UpdateAutomaticDiscountSchema.parse(args);
      // Try basic update first
      const q = `mutation discountAutomaticBasicUpdate($id:ID!,$automaticBasicDiscount:DiscountAutomaticBasicInput!){discountAutomaticBasicUpdate(id:$id,automaticBasicDiscount:$automaticBasicDiscount){automaticDiscountNode{id}userErrors{field message}}}`;
      const data = await logger.time("tool.update_automatic_discount", () =>
        gql(q, { id, automaticBasicDiscount: input })
      , { tool: "update_automatic_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    delete_automatic_discount: async (args) => {
      const { id } = DeleteAutomaticDiscountSchema.parse(args);
      const q = `mutation discountAutomaticDelete($id:ID!){discountAutomaticDelete(id:$id){deletedAutomaticDiscountId userErrors{field message}}}`;
      const data = await logger.time("tool.delete_automatic_discount", () => gql(q, { id }), { tool: "delete_automatic_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    activate_automatic_discount: async (args) => {
      const { id } = ActivateDiscountSchema.parse(args);
      const q = `mutation discountAutomaticActivate($id:ID!){discountAutomaticActivate(id:$id){automaticDiscountNode{id automaticDiscount{... on DiscountAutomaticBasic{title status}}}userErrors{field message}}}`;
      const data = await logger.time("tool.activate_automatic_discount", () => gql(q, { id }), { tool: "activate_automatic_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    deactivate_automatic_discount: async (args) => {
      const { id } = ActivateDiscountSchema.parse(args);
      const q = `mutation discountAutomaticDeactivate($id:ID!){discountAutomaticDeactivate(id:$id){automaticDiscountNode{id automaticDiscount{... on DiscountAutomaticBasic{title status}}}userErrors{field message}}}`;
      const data = await logger.time("tool.deactivate_automatic_discount", () => gql(q, { id }), { tool: "deactivate_automatic_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
