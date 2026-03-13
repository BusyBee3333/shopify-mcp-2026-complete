// Discounts tools — Shopify Admin API 2024-01
// Covers: list_discount_codes, create_discount_code, get_discount_code, create_price_rule, list_price_rules

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
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
  errors?: Record<string, string[]>;
}

// === Zod Schemas ===
const ListPriceRulesSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page (from previous response nextPageInfo)"),
  created_at_min: z.string().optional().describe("Filter created after ISO 8601 date"),
  created_at_max: z.string().optional().describe("Filter created before ISO 8601 date"),
  starts_at_min: z.string().optional().describe("Filter by start date min"),
  ends_at_max: z.string().optional().describe("Filter by end date max"),
});

const CreatePriceRuleSchema = z.object({
  title: z.string().describe("Internal title for the price rule"),
  target_type: z.enum(["line_item", "shipping_line"]).default("line_item").describe("Type of target the discount applies to"),
  target_selection: z.enum(["all", "entitled"]).default("all").describe("Which items are discounted"),
  allocation_method: z.enum(["each", "across"]).default("across").describe("How discount is split across items"),
  value_type: z.enum(["fixed_amount", "percentage"]).describe("Type of discount value"),
  value: z.string().describe("Discount value (negative number, e.g. -10.0 for $10 off or -10.0 for 10%)"),
  customer_selection: z.enum(["all", "prerequisite"]).default("all").describe("Which customers can use this rule"),
  starts_at: z.string().describe("Start date/time (ISO 8601)"),
  ends_at: z.string().optional().describe("End date/time (ISO 8601), null for no expiry"),
  usage_limit: z.number().optional().describe("Maximum number of times this rule can be used (null for unlimited)"),
  once_per_customer: z.boolean().optional().default(false).describe("Limit each customer to one use"),
  entitled_product_ids: z.array(z.number()).optional().describe("Product IDs this rule applies to (when target_selection=entitled)"),
  entitled_variant_ids: z.array(z.number()).optional().describe("Variant IDs this rule applies to"),
  entitled_collection_ids: z.array(z.number()).optional().describe("Collection IDs this rule applies to"),
  prerequisite_subtotal_range: z.object({
    greater_than_or_equal_to: z.string().describe("Minimum subtotal required"),
  }).optional().describe("Minimum order subtotal required"),
});

const ListDiscountCodesSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID to list discount codes for"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
});

const GetDiscountCodeSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID the discount code belongs to"),
  discount_code_id: z.string().describe("Discount code ID"),
});

const CreateDiscountCodeSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID to create the discount code under"),
  code: z.string().describe("Discount code string (e.g. SAVE10 — must be unique)"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_price_rules",
      title: "List Price Rules",
      description:
        "List all Shopify price rules (the parent objects that define discount logic). Each price rule can have multiple discount codes. Returns title, value_type, value, usage_limit, and date range. Use to browse available discount configurations.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          created_at_min: { type: "string", description: "Filter created after ISO 8601 date" },
          created_at_max: { type: "string", description: "Filter created before ISO 8601 date" },
          starts_at_min: { type: "string", description: "Filter by start date min" },
          ends_at_max: { type: "string", description: "Filter by end date max" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: { count: { type: "number" }, hasMore: { type: "boolean" }, nextPageInfo: { type: "string" } },
          },
        },
        required: ["data", "meta"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "create_price_rule",
      title: "Create Price Rule",
      description:
        "Create a new Shopify price rule (discount rule) that defines the discount type, value, eligibility, and usage limits. After creating a price rule, use create_discount_code to generate the actual code customers enter.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Internal title for the rule" },
          value_type: { type: "string", enum: ["fixed_amount", "percentage"], description: "Discount type" },
          value: { type: "string", description: "Discount amount (negative, e.g. -10.0)" },
          starts_at: { type: "string", description: "Start date/time (ISO 8601)" },
          target_type: { type: "string", enum: ["line_item", "shipping_line"], description: "What is discounted" },
          target_selection: { type: "string", enum: ["all", "entitled"], description: "Which items" },
          allocation_method: { type: "string", enum: ["each", "across"], description: "How discount is split" },
          customer_selection: { type: "string", enum: ["all", "prerequisite"], description: "Which customers" },
          ends_at: { type: "string", description: "End date/time (ISO 8601)" },
          usage_limit: { type: "number", description: "Max total uses (null for unlimited)" },
          once_per_customer: { type: "boolean", description: "One use per customer" },
          entitled_product_ids: { type: "array", items: { type: "number" }, description: "Product IDs" },
          entitled_collection_ids: { type: "array", items: { type: "number" }, description: "Collection IDs" },
          prerequisite_subtotal_range: {
            type: "object",
            description: "Minimum subtotal requirement",
            properties: { greater_than_or_equal_to: { type: "string" } },
          },
        },
        required: ["title", "value_type", "value", "starts_at"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          title: { type: "string" },
          value_type: { type: "string" },
          value: { type: "string" },
        },
        required: ["id", "title"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "list_discount_codes",
      title: "List Discount Codes",
      description:
        "List all discount codes for a specific Shopify price rule. Returns the code string, usage count, and timestamps. Supports cursor-based pagination. Use when auditing which codes exist under a price rule.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Price rule ID" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
        required: ["price_rule_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: { count: { type: "number" }, hasMore: { type: "boolean" } },
          },
        },
        required: ["data", "meta"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "get_discount_code",
      title: "Get Discount Code",
      description:
        "Get a specific discount code by price rule ID and discount code ID. Returns the code string, usage count, and associated price rule ID. Use when verifying a specific discount code.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Price rule ID" },
          discount_code_id: { type: "string", description: "Discount code ID" },
        },
        required: ["price_rule_id", "discount_code_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          code: { type: "string" },
          price_rule_id: { type: "number" },
          usage_count: { type: "number" },
          created_at: { type: "string" },
        },
        required: ["id", "code"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "create_discount_code",
      title: "Create Discount Code",
      description:
        "Create a new discount code under an existing Shopify price rule. The code is what customers enter at checkout. Must be unique across the store. Use after create_price_rule to make the discount usable.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Price rule ID to attach the code to" },
          code: { type: "string", description: "Unique discount code string (e.g. SAVE10)" },
        },
        required: ["price_rule_id", "code"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          code: { type: "string" },
          price_rule_id: { type: "number" },
          created_at: { type: "string" },
        },
        required: ["id", "code"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

// === Tool Handlers ===
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
        const extraParams: Record<string, string> = {};
        if (params.created_at_min) extraParams.created_at_min = params.created_at_min;
        if (params.created_at_max) extraParams.created_at_max = params.created_at_max;
        if (params.starts_at_min) extraParams.starts_at_min = params.starts_at_min;
        if (params.ends_at_max) extraParams.ends_at_max = params.ends_at_max;

        result = await logger.time("tool.list_price_rules", () =>
          client.paginatedGet<ShopifyPriceRule>("/price_rules.json", extraParams, params.limit)
        , { tool: "list_price_rules" });
      }

      const response = {
        data: result.data,
        meta: {
          count: result.data.length,
          hasMore: !!result.nextPageInfo,
          ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    create_price_rule: async (args) => {
      const params = CreatePriceRuleSchema.parse(args);
      const data = await logger.time("tool.create_price_rule", () =>
        client.post<{ price_rule: ShopifyPriceRule }>("/price_rules.json", { price_rule: params })
      , { tool: "create_price_rule" });

      const rule = (data as { price_rule: ShopifyPriceRule }).price_rule;

      return {
        content: [{ type: "text", text: JSON.stringify(rule, null, 2) }],
        structuredContent: rule,
      };
    },

    list_discount_codes: async (args) => {
      const params = ListDiscountCodesSchema.parse(args);
      let result: { data: ShopifyDiscountCode[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_discount_codes", () =>
          client.paginateFromCursor<ShopifyDiscountCode>(
            `/price_rules/${params.price_rule_id}/discount_codes.json`,
            params.page_info!,
            params.limit
          )
        , { tool: "list_discount_codes" });
      } else {
        result = await logger.time("tool.list_discount_codes", () =>
          client.paginatedGet<ShopifyDiscountCode>(
            `/price_rules/${params.price_rule_id}/discount_codes.json`,
            {},
            params.limit
          )
        , { tool: "list_discount_codes" });
      }

      const response = {
        data: result.data,
        meta: {
          count: result.data.length,
          hasMore: !!result.nextPageInfo,
          ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_discount_code: async (args) => {
      const { price_rule_id, discount_code_id } = GetDiscountCodeSchema.parse(args);
      const data = await logger.time("tool.get_discount_code", () =>
        client.get<{ discount_code: ShopifyDiscountCode }>(
          `/price_rules/${price_rule_id}/discount_codes/${discount_code_id}.json`
        )
      , { tool: "get_discount_code", price_rule_id, discount_code_id });

      const code = (data as { discount_code: ShopifyDiscountCode }).discount_code;

      return {
        content: [{ type: "text", text: JSON.stringify(code, null, 2) }],
        structuredContent: code,
      };
    },

    create_discount_code: async (args) => {
      const { price_rule_id, code } = CreateDiscountCodeSchema.parse(args);
      const data = await logger.time("tool.create_discount_code", () =>
        client.post<{ discount_code: ShopifyDiscountCode }>(
          `/price_rules/${price_rule_id}/discount_codes.json`,
          { discount_code: { code } }
        )
      , { tool: "create_discount_code", price_rule_id });

      const discountCode = (data as { discount_code: ShopifyDiscountCode }).discount_code;

      return {
        content: [{ type: "text", text: JSON.stringify(discountCode, null, 2) }],
        structuredContent: discountCode,
      };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return {
    tools: getToolDefinitions(),
    handlers: getToolHandlers(client),
  };
}
