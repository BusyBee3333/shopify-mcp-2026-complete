// Price Rules Extended tools — Shopify Admin API 2024-01
// Covers: update_price_rule, delete_price_rule, get_price_rule, count_price_rules, count_discount_codes
// Advanced: entitled products/variants/collections, prerequisite management

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyPriceRule {
  id?: number;
  title?: string;
  target_type?: string;
  target_selection?: string;
  allocation_method?: string;
  value_type?: string;
  value?: string;
  once_per_customer?: boolean;
  usage_limit?: number | null;
  customer_selection?: string;
  starts_at?: string;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
  entitled_product_ids?: number[];
  entitled_variant_ids?: number[];
  entitled_collection_ids?: number[];
  entitled_country_ids?: number[];
  prerequisite_product_ids?: number[];
  prerequisite_variant_ids?: number[];
  prerequisite_collection_ids?: number[];
  prerequisite_customer_ids?: number[];
  prerequisite_saved_search_ids?: number[];
  prerequisite_subtotal_range?: { greater_than_or_equal_to: string };
  prerequisite_quantity_range?: { greater_than_or_equal_to: number };
  prerequisite_shipping_price_range?: { less_than_or_equal_to: string };
  prerequisite_to_entitlement_quantity_ratio?: { prerequisite_quantity: number; entitled_quantity: number };
  prerequisite_to_entitlement_purchase?: { prerequisite_amount: string };
  allocation_limit?: number | null;
}

const GetPriceRuleSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID"),
});

const UpdatePriceRuleSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID to update"),
  title: z.string().optional().describe("Updated title"),
  value: z.string().optional().describe("Updated discount value (negative)"),
  starts_at: z.string().optional().describe("Updated start date (ISO 8601)"),
  ends_at: z.string().optional().nullable().describe("Updated end date (null for no expiry)"),
  usage_limit: z.number().optional().nullable().describe("Updated usage limit"),
  once_per_customer: z.boolean().optional().describe("Limit to once per customer"),
  entitled_product_ids: z.array(z.number()).optional().describe("Entitled product IDs (for target_selection=entitled)"),
  entitled_variant_ids: z.array(z.number()).optional().describe("Entitled variant IDs"),
  entitled_collection_ids: z.array(z.number()).optional().describe("Entitled collection IDs"),
  entitled_country_ids: z.array(z.number()).optional().describe("Entitled country IDs (for shipping discounts)"),
  prerequisite_product_ids: z.array(z.number()).optional().describe("Prerequisite product IDs"),
  prerequisite_variant_ids: z.array(z.number()).optional().describe("Prerequisite variant IDs"),
  prerequisite_collection_ids: z.array(z.number()).optional().describe("Prerequisite collection IDs"),
  prerequisite_customer_ids: z.array(z.number()).optional().describe("Specific customer IDs eligible"),
  prerequisite_subtotal_range: z.object({
    greater_than_or_equal_to: z.string().describe("Minimum subtotal amount"),
  }).optional().describe("Minimum subtotal prerequisite"),
  prerequisite_quantity_range: z.object({
    greater_than_or_equal_to: z.number().describe("Minimum quantity"),
  }).optional().describe("Minimum quantity prerequisite"),
  prerequisite_shipping_price_range: z.object({
    less_than_or_equal_to: z.string().describe("Max shipping price for eligibility"),
  }).optional().describe("Shipping price prerequisite (for free shipping rules)"),
  prerequisite_to_entitlement_quantity_ratio: z.object({
    prerequisite_quantity: z.number().describe("Buy X quantity"),
    entitled_quantity: z.number().describe("Get Y quantity"),
  }).optional().describe("Buy X get Y quantity ratio"),
  allocation_limit: z.number().optional().nullable().describe("Max times discount applies per order"),
});

const DeletePriceRuleSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID to delete"),
});

const CountPriceRulesSchema = z.object({
  times_used: z.number().optional().describe("Filter by number of times used"),
  starts_at_min: z.string().optional().describe("Filter by start date min"),
  starts_at_max: z.string().optional().describe("Filter by start date max"),
  ends_at_min: z.string().optional().describe("Filter by end date min"),
  ends_at_max: z.string().optional().describe("Filter by end date max"),
  created_at_min: z.string().optional().describe("Filter by created date min"),
  created_at_max: z.string().optional().describe("Filter by created date max"),
});

const CountDiscountCodesSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID"),
});

const CreateFreeShippingRuleSchema = z.object({
  title: z.string().describe("Price rule title"),
  starts_at: z.string().describe("Start date/time (ISO 8601)"),
  ends_at: z.string().optional().describe("End date/time"),
  usage_limit: z.number().optional().describe("Maximum uses"),
  once_per_customer: z.boolean().optional().default(false),
  prerequisite_subtotal_range: z.object({
    greater_than_or_equal_to: z.string().describe("Minimum subtotal to qualify"),
  }).optional().describe("Minimum subtotal for free shipping"),
  prerequisite_shipping_price_range: z.object({
    less_than_or_equal_to: z.string().describe("Maximum shipping cost that qualifies"),
  }).optional().describe("Shipping price cap for eligibility"),
  entitled_country_ids: z.array(z.number()).optional().describe("Countries eligible for free shipping (empty = all)"),
  customer_selection: z.enum(["all", "prerequisite"]).optional().default("all"),
  prerequisite_customer_ids: z.array(z.number()).optional().describe("Specific customers (when customer_selection=prerequisite)"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_price_rule",
      title: "Get Price Rule",
      description: "Get a single price rule by ID with full details including entitled products/variants/collections, prerequisite conditions, and usage statistics.",
      inputSchema: {
        type: "object",
        properties: { price_rule_id: { type: "string", description: "Price rule ID" } },
        required: ["price_rule_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "update_price_rule",
      title: "Update Price Rule",
      description: "Update an existing price rule. Supports updating entitled products/variants/collections, prerequisites (minimum subtotal, quantity, specific customers), allocation limits, and Buy X Get Y ratios.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Price rule ID" },
          title: { type: "string", description: "Updated title" },
          value: { type: "string", description: "Discount value (negative)" },
          starts_at: { type: "string", description: "Start date (ISO 8601)" },
          ends_at: { type: "string", description: "End date (null for no expiry)" },
          usage_limit: { type: "number", description: "Max total uses" },
          once_per_customer: { type: "boolean", description: "One use per customer" },
          entitled_product_ids: { type: "array", items: { type: "number" }, description: "Product IDs discount applies to" },
          entitled_variant_ids: { type: "array", items: { type: "number" }, description: "Variant IDs discount applies to" },
          entitled_collection_ids: { type: "array", items: { type: "number" }, description: "Collection IDs discount applies to" },
          entitled_country_ids: { type: "array", items: { type: "number" }, description: "Country IDs (shipping discounts)" },
          prerequisite_product_ids: { type: "array", items: { type: "number" }, description: "Products customer must buy" },
          prerequisite_collection_ids: { type: "array", items: { type: "number" }, description: "Collections customer must buy from" },
          prerequisite_customer_ids: { type: "array", items: { type: "number" }, description: "Eligible customer IDs" },
          prerequisite_subtotal_range: { type: "object", description: "Minimum subtotal {greater_than_or_equal_to: string}" },
          prerequisite_quantity_range: { type: "object", description: "Minimum quantity {greater_than_or_equal_to: number}" },
          prerequisite_shipping_price_range: { type: "object", description: "Max shipping price {less_than_or_equal_to: string}" },
          prerequisite_to_entitlement_quantity_ratio: { type: "object", description: "Buy X get Y ratio {prerequisite_quantity, entitled_quantity}" },
          allocation_limit: { type: "number", description: "Max times discount applies per order" },
        },
        required: ["price_rule_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_price_rule",
      title: "Delete Price Rule",
      description: "Permanently delete a price rule and all its discount codes. This action cannot be undone.",
      inputSchema: {
        type: "object",
        properties: { price_rule_id: { type: "string", description: "Price rule ID to delete" } },
        required: ["price_rule_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "count_price_rules",
      title: "Count Price Rules",
      description: "Get the total count of price rules, optionally filtered by date ranges and usage.",
      inputSchema: {
        type: "object",
        properties: {
          times_used: { type: "number", description: "Filter by times used" },
          starts_at_min: { type: "string", description: "Start date min" },
          starts_at_max: { type: "string", description: "Start date max" },
          ends_at_min: { type: "string", description: "End date min" },
          ends_at_max: { type: "string", description: "End date max" },
          created_at_min: { type: "string", description: "Created date min" },
          created_at_max: { type: "string", description: "Created date max" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "count_discount_codes",
      title: "Count Discount Codes",
      description: "Get the total count of discount codes for a price rule.",
      inputSchema: {
        type: "object",
        properties: { price_rule_id: { type: "string", description: "Price rule ID" } },
        required: ["price_rule_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_free_shipping_price_rule",
      title: "Create Free Shipping Price Rule",
      description: "Create a free shipping price rule — a special rule targeting shipping_line that sets shipping to $0. Supports minimum subtotal requirements, specific countries, and customer eligibility.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Rule title" },
          starts_at: { type: "string", description: "Start date (ISO 8601)" },
          ends_at: { type: "string", description: "End date" },
          usage_limit: { type: "number", description: "Max total uses" },
          once_per_customer: { type: "boolean", description: "One use per customer" },
          prerequisite_subtotal_range: { type: "object", description: "Minimum subtotal" },
          prerequisite_shipping_price_range: { type: "object", description: "Max eligible shipping cost" },
          entitled_country_ids: { type: "array", description: "Eligible country IDs (empty = all)" },
          customer_selection: { type: "string", enum: ["all", "prerequisite"], description: "Customer eligibility" },
          prerequisite_customer_ids: { type: "array", description: "Specific customer IDs" },
        },
        required: ["title", "starts_at"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    get_price_rule: async (args) => {
      const { price_rule_id } = GetPriceRuleSchema.parse(args);
      const data = await logger.time("tool.get_price_rule", () =>
        client.get<{ price_rule: ShopifyPriceRule }>(`/price_rules/${price_rule_id}.json`)
      , { tool: "get_price_rule" });
      const rule = (data as { price_rule: ShopifyPriceRule }).price_rule;
      return { content: [{ type: "text", text: JSON.stringify(rule, null, 2) }], structuredContent: rule as Record<string, unknown> };
    },

    update_price_rule: async (args) => {
      const { price_rule_id, ...updateData } = UpdatePriceRuleSchema.parse(args);
      const data = await logger.time("tool.update_price_rule", () =>
        client.put<{ price_rule: ShopifyPriceRule }>(`/price_rules/${price_rule_id}.json`, { price_rule: updateData })
      , { tool: "update_price_rule" });
      const rule = (data as { price_rule: ShopifyPriceRule }).price_rule;
      return { content: [{ type: "text", text: JSON.stringify(rule, null, 2) }], structuredContent: rule as Record<string, unknown> };
    },

    delete_price_rule: async (args) => {
      const { price_rule_id } = DeletePriceRuleSchema.parse(args);
      await logger.time("tool.delete_price_rule", () =>
        client.delete(`/price_rules/${price_rule_id}.json`)
      , { tool: "delete_price_rule" });
      const result = { success: true, deleted_id: price_rule_id };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },

    count_price_rules: async (args) => {
      const params = CountPriceRulesSchema.parse(args);
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
      const data = await logger.time("tool.count_price_rules", () =>
        client.get<{ count: number }>(`/price_rules/count.json?${qs}`)
      , { tool: "count_price_rules" });
      const count = (data as { count: number }).count;
      const result = { count };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },

    count_discount_codes: async (args) => {
      const { price_rule_id } = CountDiscountCodesSchema.parse(args);
      const data = await logger.time("tool.count_discount_codes", () =>
        client.get<{ count: number }>(`/price_rules/${price_rule_id}/discount_codes/count.json`)
      , { tool: "count_discount_codes" });
      const count = (data as { count: number }).count;
      const result = { count, price_rule_id };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },

    create_free_shipping_price_rule: async (args) => {
      const params = CreateFreeShippingRuleSchema.parse(args);
      const ruleBody = {
        ...params,
        target_type: "shipping_line",
        target_selection: "all",
        allocation_method: "each",
        value_type: "percentage",
        value: "-100.0",
      };
      const data = await logger.time("tool.create_free_shipping_price_rule", () =>
        client.post<{ price_rule: ShopifyPriceRule }>("/price_rules.json", { price_rule: ruleBody })
      , { tool: "create_free_shipping_price_rule" });
      const rule = (data as { price_rule: ShopifyPriceRule }).price_rule;
      return { content: [{ type: "text", text: JSON.stringify(rule, null, 2) }], structuredContent: rule as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
