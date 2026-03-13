// Gift Card Adjustments tools — Shopify Admin API 2024-01
// Covers: list_gift_card_adjustments, get_gift_card_adjustment, create_gift_card_adjustment

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyGiftCardAdjustment {
  id?: number;
  gift_card_id?: number;
  api_client_id?: number | null;
  user_id?: number | null;
  order_transaction_id?: number | null;
  number?: number;
  amount?: string;
  processed_at?: string;
  created_at?: string;
  updated_at?: string;
  note?: string | null;
  remote_transaction_ref?: string | null;
  remote_transaction_url?: string | null;
}

const ListGiftCardAdjustmentsSchema = z.object({
  gift_card_id: z.string().describe("Gift card ID to list adjustments for"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250)"),
});

const GetGiftCardAdjustmentSchema = z.object({
  gift_card_id: z.string().describe("Gift card ID"),
  adjustment_id: z.string().describe("Adjustment ID"),
});

const CreateGiftCardAdjustmentSchema = z.object({
  gift_card_id: z.string().describe("Gift card ID to adjust balance on"),
  amount: z.string().describe("Amount to adjust (positive to add balance, negative to deduct)"),
  note: z.string().optional().describe("Internal note for this adjustment"),
  remote_transaction_ref: z.string().optional().describe("External transaction reference"),
  remote_transaction_url: z.string().optional().describe("URL to external transaction"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_gift_card_adjustments",
      title: "List Gift Card Adjustments",
      description: "List all balance adjustments for a gift card. Returns debit/credit amounts, timestamps, and associated order transactions. Useful for auditing gift card usage history.",
      inputSchema: {
        type: "object",
        properties: {
          gift_card_id: { type: "string", description: "Gift card ID" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
        },
        required: ["gift_card_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_gift_card_adjustment",
      title: "Get Gift Card Adjustment",
      description: "Get a specific adjustment on a gift card by ID. Returns amount, note, and any linked transaction references.",
      inputSchema: {
        type: "object",
        properties: {
          gift_card_id: { type: "string", description: "Gift card ID" },
          adjustment_id: { type: "string", description: "Adjustment ID" },
        },
        required: ["gift_card_id", "adjustment_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_gift_card_adjustment",
      title: "Create Gift Card Adjustment",
      description: "Manually adjust a gift card balance. Use a positive amount to add credit or a negative amount to deduct. Include a note for auditing. Useful for refunds, corrections, or promotional credits.",
      inputSchema: {
        type: "object",
        properties: {
          gift_card_id: { type: "string", description: "Gift card ID" },
          amount: { type: "string", description: "Adjustment amount (positive to add, negative to deduct)" },
          note: { type: "string", description: "Internal note" },
          remote_transaction_ref: { type: "string", description: "External transaction reference" },
          remote_transaction_url: { type: "string", description: "URL to external transaction" },
        },
        required: ["gift_card_id", "amount"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_gift_card_adjustments: async (args) => {
      const { gift_card_id, limit } = ListGiftCardAdjustmentsSchema.parse(args);
      const data = await logger.time("tool.list_gift_card_adjustments", () =>
        client.get<{ adjustments: ShopifyGiftCardAdjustment[] }>(
          `/gift_cards/${gift_card_id}/adjustments.json?limit=${limit}`
        )
      , { tool: "list_gift_card_adjustments" });
      const adjustments = (data as { adjustments: ShopifyGiftCardAdjustment[] }).adjustments;
      const response = { data: adjustments, meta: { count: adjustments.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_gift_card_adjustment: async (args) => {
      const { gift_card_id, adjustment_id } = GetGiftCardAdjustmentSchema.parse(args);
      const data = await logger.time("tool.get_gift_card_adjustment", () =>
        client.get<{ adjustment: ShopifyGiftCardAdjustment }>(
          `/gift_cards/${gift_card_id}/adjustments/${adjustment_id}.json`
        )
      , { tool: "get_gift_card_adjustment" });
      const adjustment = (data as { adjustment: ShopifyGiftCardAdjustment }).adjustment;
      return { content: [{ type: "text", text: JSON.stringify(adjustment, null, 2) }], structuredContent: adjustment as Record<string, unknown> };
    },

    create_gift_card_adjustment: async (args) => {
      const { gift_card_id, ...adjustData } = CreateGiftCardAdjustmentSchema.parse(args);
      const data = await logger.time("tool.create_gift_card_adjustment", () =>
        client.post<{ adjustment: ShopifyGiftCardAdjustment }>(
          `/gift_cards/${gift_card_id}/adjustments.json`,
          { adjustment: adjustData }
        )
      , { tool: "create_gift_card_adjustment" });
      const adjustment = (data as { adjustment: ShopifyGiftCardAdjustment }).adjustment;
      return { content: [{ type: "text", text: JSON.stringify(adjustment, null, 2) }], structuredContent: adjustment as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
