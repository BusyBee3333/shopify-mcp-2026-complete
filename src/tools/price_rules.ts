// Price Rules tools — Shopify Admin API 2024-01
// Covers: list_price_rules, get_price_rule, create_price_rule, update_price_rule, delete_price_rule,
//         list_discount_codes, get_discount_code, create_discount_code, delete_discount_code,
//         batch_create_discount_codes, lookup_discount_code

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyPriceRule {
  id: number;
  title: string;
  target_type?: string;
  target_selection?: string;
  allocation_method?: string;
  value_type?: string;
  value?: string;
  once_per_customer?: boolean;
  usage_limit?: number | null;
  customer_selection?: string;
  prerequisite_subtotal_range?: { greater_than_or_equal_to: string } | null;
  starts_at?: string;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyDiscountCode {
  id?: number;
  code?: string;
  price_rule_id?: number;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListPriceRulesSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  starts_at_min: z.string().optional().describe("ISO8601 datetime"),
  starts_at_max: z.string().optional(),
  ends_at_min: z.string().optional(),
  ends_at_max: z.string().optional(),
  created_at_min: z.string().optional(),
  created_at_max: z.string().optional(),
});

const GetPriceRuleSchema = z.object({
  price_rule_id: z.string().describe("Shopify price rule ID"),
});

const CreatePriceRuleSchema = z.object({
  title: z.string().describe("Internal title for the price rule"),
  target_type: z.enum(["line_item", "shipping_line"]).default("line_item"),
  target_selection: z.enum(["all", "entitled"]).default("all"),
  allocation_method: z.enum(["each", "across"]).default("each"),
  value_type: z.enum(["fixed_amount", "percentage"]).describe("Type of discount value"),
  value: z.string().describe("Discount value (negative number for discounts, e.g. '-10.0')"),
  customer_selection: z.enum(["all", "prerequisite"]).default("all"),
  starts_at: z.string().describe("ISO8601 start datetime"),
  ends_at: z.string().optional().describe("ISO8601 end datetime (null = no expiry)"),
  once_per_customer: z.boolean().optional().default(false),
  usage_limit: z.number().optional().nullable().describe("Max total uses (null = unlimited)"),
  prerequisite_subtotal_range: z.object({ greater_than_or_equal_to: z.string() }).optional(),
});

const UpdatePriceRuleSchema = z.object({
  price_rule_id: z.string(),
  title: z.string().optional(),
  value: z.string().optional(),
  ends_at: z.string().optional().nullable(),
  once_per_customer: z.boolean().optional(),
  usage_limit: z.number().optional().nullable(),
});

const DeletePriceRuleSchema = z.object({
  price_rule_id: z.string(),
});

const ListDiscountCodesSchema = z.object({
  price_rule_id: z.string(),
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
});

const GetDiscountCodeSchema = z.object({
  price_rule_id: z.string(),
  discount_code_id: z.string(),
});

const CreateDiscountCodeSchema = z.object({
  price_rule_id: z.string(),
  code: z.string().describe("The discount code string (e.g. 'SUMMER20')"),
});

const DeleteDiscountCodeSchema = z.object({
  price_rule_id: z.string(),
  discount_code_id: z.string(),
});

const LookupDiscountCodeSchema = z.object({
  code: z.string().describe("Discount code to look up"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_price_rules",
      title: "List Price Rules",
      description: "List all price rules in the store. Price rules define the discount logic (percentage off, fixed amount, free shipping). Use this to browse existing promotions or find a rule ID for managing discount codes.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          starts_at_min: { type: "string", description: "Filter by start date (ISO8601)" },
          starts_at_max: { type: "string" },
          ends_at_min: { type: "string" },
          ends_at_max: { type: "string" },
          created_at_min: { type: "string" },
          created_at_max: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_price_rule",
      title: "Get Price Rule",
      description: "Get a specific price rule by ID, including its value type, discount amount, customer selection, and validity window.",
      inputSchema: {
        type: "object",
        properties: { price_rule_id: { type: "string", description: "Price rule ID" } },
        required: ["price_rule_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_price_rule",
      title: "Create Price Rule",
      description: "Create a new price rule (discount logic). After creating, use create_discount_code to attach a code to it. Supports percentage off, fixed amount, and free shipping discounts.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          target_type: { type: "string", enum: ["line_item", "shipping_line"] },
          target_selection: { type: "string", enum: ["all", "entitled"] },
          allocation_method: { type: "string", enum: ["each", "across"] },
          value_type: { type: "string", enum: ["fixed_amount", "percentage"] },
          value: { type: "string", description: "Discount value (negative, e.g. '-10.0')" },
          customer_selection: { type: "string", enum: ["all", "prerequisite"] },
          starts_at: { type: "string" },
          ends_at: { type: "string" },
          once_per_customer: { type: "boolean" },
          usage_limit: { type: "number" },
        },
        required: ["title", "value_type", "value", "starts_at"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_price_rule",
      title: "Update Price Rule",
      description: "Update an existing price rule. You can change its value, end date, usage limit, or once-per-customer setting.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string" },
          title: { type: "string" },
          value: { type: "string" },
          ends_at: { type: "string" },
          once_per_customer: { type: "boolean" },
          usage_limit: { type: "number" },
        },
        required: ["price_rule_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_price_rule",
      title: "Delete Price Rule",
      description: "Permanently delete a price rule and all its discount codes. This cannot be undone.",
      inputSchema: {
        type: "object",
        properties: { price_rule_id: { type: "string" } },
        required: ["price_rule_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "list_discount_codes",
      title: "List Discount Codes",
      description: "List all discount codes for a price rule. Returns code strings, usage counts, and creation dates.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string" },
          limit: { type: "number" },
          page_info: { type: "string" },
        },
        required: ["price_rule_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_discount_code",
      title: "Get Discount Code",
      description: "Get a specific discount code by ID within a price rule.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string" },
          discount_code_id: { type: "string" },
        },
        required: ["price_rule_id", "discount_code_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_discount_code",
      title: "Create Discount Code",
      description: "Create a discount code under a price rule. The code is what customers enter at checkout. Multiple codes can share the same price rule.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string" },
          code: { type: "string", description: "Code customers enter (e.g. SUMMER20)" },
        },
        required: ["price_rule_id", "code"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_discount_code",
      title: "Delete Discount Code",
      description: "Permanently delete a discount code. The price rule is not affected.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string" },
          discount_code_id: { type: "string" },
        },
        required: ["price_rule_id", "discount_code_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "lookup_discount_code",
      title: "Lookup Discount Code",
      description: "Look up a discount code by its string value to find its ID and associated price rule ID. Useful when you have a code but not its ID.",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string", description: "Discount code to look up" } },
        required: ["code"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_price_rules: async (args) => {
      const params = ListPriceRulesSchema.parse(args);
      let result: { data: ShopifyPriceRule[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_price_rules", () =>
          client.paginateFromCursor<ShopifyPriceRule>("/price_rules.json", params.page_info!, params.limit)
        , { tool: "list_price_rules" });
      } else {
        const extra: Record<string, string> = {};
        if (params.starts_at_min) extra.starts_at_min = params.starts_at_min;
        if (params.starts_at_max) extra.starts_at_max = params.starts_at_max;
        if (params.ends_at_min) extra.ends_at_min = params.ends_at_min;
        if (params.ends_at_max) extra.ends_at_max = params.ends_at_max;
        if (params.created_at_min) extra.created_at_min = params.created_at_min;
        if (params.created_at_max) extra.created_at_max = params.created_at_max;
        result = await logger.time("tool.list_price_rules", () =>
          client.paginatedGet<ShopifyPriceRule>("/price_rules.json", extra, params.limit)
        , { tool: "list_price_rules" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_price_rule: async (args) => {
      const { price_rule_id } = GetPriceRuleSchema.parse(args);
      const data = await logger.time("tool.get_price_rule", () =>
        client.get<{ price_rule: ShopifyPriceRule }>(`/price_rules/${price_rule_id}.json`)
      , { tool: "get_price_rule" });
      const rule = (data as { price_rule: ShopifyPriceRule }).price_rule;
      return { content: [{ type: "text", text: JSON.stringify(rule, null, 2) }], structuredContent: rule };
    },

    create_price_rule: async (args) => {
      const params = CreatePriceRuleSchema.parse(args);
      const data = await logger.time("tool.create_price_rule", () =>
        client.post<{ price_rule: ShopifyPriceRule }>("/price_rules.json", { price_rule: params })
      , { tool: "create_price_rule" });
      const rule = (data as { price_rule: ShopifyPriceRule }).price_rule;
      return { content: [{ type: "text", text: JSON.stringify(rule, null, 2) }], structuredContent: rule };
    },

    update_price_rule: async (args) => {
      const { price_rule_id, ...updateData } = UpdatePriceRuleSchema.parse(args);
      const data = await logger.time("tool.update_price_rule", () =>
        client.put<{ price_rule: ShopifyPriceRule }>(`/price_rules/${price_rule_id}.json`, { price_rule: updateData })
      , { tool: "update_price_rule" });
      const rule = (data as { price_rule: ShopifyPriceRule }).price_rule;
      return { content: [{ type: "text", text: JSON.stringify(rule, null, 2) }], structuredContent: rule };
    },

    delete_price_rule: async (args) => {
      const { price_rule_id } = DeletePriceRuleSchema.parse(args);
      await logger.time("tool.delete_price_rule", () =>
        client.delete<unknown>(`/price_rules/${price_rule_id}.json`)
      , { tool: "delete_price_rule" });
      const response = { success: true, price_rule_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    list_discount_codes: async (args) => {
      const params = ListDiscountCodesSchema.parse(args);
      let result: { data: ShopifyDiscountCode[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_discount_codes", () =>
          client.paginateFromCursor<ShopifyDiscountCode>(`/price_rules/${params.price_rule_id}/discount_codes.json`, params.page_info!, params.limit)
        , { tool: "list_discount_codes" });
      } else {
        result = await logger.time("tool.list_discount_codes", () =>
          client.paginatedGet<ShopifyDiscountCode>(`/price_rules/${params.price_rule_id}/discount_codes.json`, {}, params.limit)
        , { tool: "list_discount_codes" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_discount_code: async (args) => {
      const { price_rule_id, discount_code_id } = GetDiscountCodeSchema.parse(args);
      const data = await logger.time("tool.get_discount_code", () =>
        client.get<{ discount_code: ShopifyDiscountCode }>(`/price_rules/${price_rule_id}/discount_codes/${discount_code_id}.json`)
      , { tool: "get_discount_code" });
      const code = (data as { discount_code: ShopifyDiscountCode }).discount_code;
      return { content: [{ type: "text", text: JSON.stringify(code, null, 2) }], structuredContent: code };
    },

    create_discount_code: async (args) => {
      const { price_rule_id, code } = CreateDiscountCodeSchema.parse(args);
      const data = await logger.time("tool.create_discount_code", () =>
        client.post<{ discount_code: ShopifyDiscountCode }>(`/price_rules/${price_rule_id}/discount_codes.json`, { discount_code: { code } })
      , { tool: "create_discount_code" });
      const dc = (data as { discount_code: ShopifyDiscountCode }).discount_code;
      return { content: [{ type: "text", text: JSON.stringify(dc, null, 2) }], structuredContent: dc };
    },

    delete_discount_code: async (args) => {
      const { price_rule_id, discount_code_id } = DeleteDiscountCodeSchema.parse(args);
      await logger.time("tool.delete_discount_code", () =>
        client.delete<unknown>(`/price_rules/${price_rule_id}/discount_codes/${discount_code_id}.json`)
      , { tool: "delete_discount_code" });
      const response = { success: true, discount_code_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    lookup_discount_code: async (args) => {
      const { code } = LookupDiscountCodeSchema.parse(args);
      const data = await logger.time("tool.lookup_discount_code", () =>
        client.get<{ discount_code: ShopifyDiscountCode }>(`/discount_codes/lookup.json?code=${encodeURIComponent(code)}`)
      , { tool: "lookup_discount_code" });
      const dc = (data as { discount_code: ShopifyDiscountCode }).discount_code;
      return { content: [{ type: "text", text: JSON.stringify(dc, null, 2) }], structuredContent: dc };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
