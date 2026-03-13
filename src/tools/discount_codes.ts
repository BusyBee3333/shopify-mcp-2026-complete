// Discount Codes Extended tools — Shopify Admin API 2024-01
// Covers: lookup_discount_code, list_discount_code_batch, create_discount_code_batch, get_discount_code_batch, delete_discount_code

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyDiscountCode {
  id?: number;
  code?: string;
  price_rule_id?: number;
  usage_count?: number;
  errors?: Record<string, string[]>;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyBatch {
  id?: number;
  price_rule_id?: number;
  started_at?: string | null;
  completed_at?: string | null;
  status?: string;
  codes_count?: number;
  imported_count?: number;
  failed_count?: number;
  logs?: unknown[];
}

const LookupDiscountCodeSchema = z.object({
  code: z.string().describe("Discount code string to look up (e.g. SAVE10)"),
});

const DeleteDiscountCodeSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID the discount code belongs to"),
  discount_code_id: z.string().describe("Discount code ID to delete"),
});

const CreateBatchSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID to create codes under"),
  codes: z.array(z.object({
    code: z.string().describe("Discount code string"),
  })).describe("Array of codes to create in batch"),
});

const GetBatchSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID"),
  batch_id: z.string().describe("Batch creation job ID"),
});

const ListBatchCodesSchema = z.object({
  price_rule_id: z.string().describe("Price rule ID"),
  batch_id: z.string().describe("Batch job ID"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "lookup_discount_code",
      title: "Lookup Discount Code by Code",
      description: "Look up a discount code by its code string across all price rules. Returns the code ID, price_rule_id, and usage count without needing to know the price rule first.",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string", description: "Discount code string (e.g. SAVE10)" } },
        required: ["code"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_discount_code",
      title: "Delete Discount Code",
      description: "Delete a discount code from a price rule. The price rule itself is not deleted — only this specific code.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Price rule ID" },
          discount_code_id: { type: "string", description: "Discount code ID to delete" },
        },
        required: ["price_rule_id", "discount_code_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_discount_code_batch",
      title: "Create Discount Code Batch",
      description: "Create multiple discount codes under a price rule in a single batch operation. Returns a batch job ID to poll for completion status. Useful for generating large sets of unique codes.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Price rule ID" },
          codes: { type: "array", description: "Array of {code: string} objects" },
        },
        required: ["price_rule_id", "codes"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_discount_code_batch",
      title: "Get Discount Code Batch Status",
      description: "Get the status of a batch discount code creation job. Returns status (queued/running/completed/failed), counts of imported/failed codes.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Price rule ID" },
          batch_id: { type: "string", description: "Batch job ID" },
        },
        required: ["price_rule_id", "batch_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_batch_discount_codes",
      title: "List Batch Discount Codes",
      description: "List discount codes that were created via a specific batch job. Use after the batch completes to verify and retrieve the created codes.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Price rule ID" },
          batch_id: { type: "string", description: "Batch job ID" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
        },
        required: ["price_rule_id", "batch_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    lookup_discount_code: async (args) => {
      const { code } = LookupDiscountCodeSchema.parse(args);
      const data = await logger.time("tool.lookup_discount_code", () =>
        client.get<{ discount_code: ShopifyDiscountCode }>(`/discount_codes/lookup.json?code=${encodeURIComponent(code)}`)
      , { tool: "lookup_discount_code" });
      const dc = (data as { discount_code: ShopifyDiscountCode }).discount_code;
      return { content: [{ type: "text", text: JSON.stringify(dc, null, 2) }], structuredContent: dc as Record<string, unknown> };
    },

    delete_discount_code: async (args) => {
      const { price_rule_id, discount_code_id } = DeleteDiscountCodeSchema.parse(args);
      await logger.time("tool.delete_discount_code", () =>
        client.delete(`/price_rules/${price_rule_id}/discount_codes/${discount_code_id}.json`)
      , { tool: "delete_discount_code" });
      const result = { success: true, deleted_id: discount_code_id };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },

    create_discount_code_batch: async (args) => {
      const { price_rule_id, codes } = CreateBatchSchema.parse(args);
      const data = await logger.time("tool.create_discount_code_batch", () =>
        client.post<{ discount_code_creation: ShopifyBatch }>(
          `/price_rules/${price_rule_id}/batch_discount_codes.json`,
          { discount_code_creation: { codes } }
        )
      , { tool: "create_discount_code_batch" });
      const batch = (data as { discount_code_creation: ShopifyBatch }).discount_code_creation;
      return { content: [{ type: "text", text: JSON.stringify(batch, null, 2) }], structuredContent: batch as Record<string, unknown> };
    },

    get_discount_code_batch: async (args) => {
      const { price_rule_id, batch_id } = GetBatchSchema.parse(args);
      const data = await logger.time("tool.get_discount_code_batch", () =>
        client.get<{ discount_code_creation: ShopifyBatch }>(
          `/price_rules/${price_rule_id}/batch_discount_codes/${batch_id}.json`
        )
      , { tool: "get_discount_code_batch" });
      const batch = (data as { discount_code_creation: ShopifyBatch }).discount_code_creation;
      return { content: [{ type: "text", text: JSON.stringify(batch, null, 2) }], structuredContent: batch as Record<string, unknown> };
    },

    list_batch_discount_codes: async (args) => {
      const { price_rule_id, batch_id, limit } = ListBatchCodesSchema.parse(args);
      const data = await logger.time("tool.list_batch_discount_codes", () =>
        client.get<{ discount_codes: ShopifyDiscountCode[] }>(
          `/price_rules/${price_rule_id}/batch_discount_codes/${batch_id}/discount_codes.json?limit=${limit}`
        )
      , { tool: "list_batch_discount_codes" });
      const codes = (data as { discount_codes: ShopifyDiscountCode[] }).discount_codes;
      const response = { data: codes, meta: { count: codes.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
