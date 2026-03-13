// Gift Cards tools — Shopify Admin API 2024-01
// Covers: list_gift_cards, get_gift_card, create_gift_card, update_gift_card, disable_gift_card

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyGiftCard {
  id?: number;
  code?: string;
  initial_value?: string;
  balance?: string;
  currency?: string;
  customer_id?: number | null;
  disabled_at?: string | null;
  expires_on?: string | null;
  last_characters?: string;
  line_item_id?: number | null;
  note?: string | null;
  order_id?: number | null;
  template_suffix?: string | null;
  user_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListGiftCardsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
  status: z.enum(["enabled", "disabled"]).optional().describe("Filter by status: enabled or disabled"),
});

const GetGiftCardSchema = z.object({
  gift_card_id: z.string().describe("Shopify gift card ID"),
});

const CreateGiftCardSchema = z.object({
  initial_value: z.string().describe("Initial monetary value of the gift card (e.g. '25.00')"),
  code: z.string().optional().describe("Gift card code (auto-generated if not provided; must be 8-20 alphanumeric chars)"),
  currency: z.string().optional().describe("3-letter ISO 4217 currency code (defaults to shop currency)"),
  customer_id: z.number().optional().describe("ID of customer to assign the gift card to"),
  expires_on: z.string().optional().describe("Expiry date in YYYY-MM-DD format (null = no expiry)"),
  note: z.string().optional().describe("Internal staff note"),
  template_suffix: z.string().optional().describe("Theme template suffix for the gift card page"),
});

const UpdateGiftCardSchema = z.object({
  gift_card_id: z.string().describe("Shopify gift card ID"),
  expires_on: z.string().optional().describe("Updated expiry date (YYYY-MM-DD; set to null to remove expiry)"),
  note: z.string().optional().describe("Updated staff note"),
  template_suffix: z.string().optional().describe("Updated template suffix"),
});

const DisableGiftCardSchema = z.object({
  gift_card_id: z.string().describe("Shopify gift card ID to disable"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_gift_cards",
      title: "List Gift Cards",
      description:
        "List all gift cards on the Shopify store. Returns code (last 4 chars), initial value, current balance, currency, customer assignment, expiry, and disabled status. Supports cursor-based pagination and filtering by enabled/disabled status.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          status: { type: "string", enum: ["enabled", "disabled"], description: "Filter by status" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" }, hasMore: { type: "boolean" }, nextPageInfo: { type: "string" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_gift_card",
      title: "Get Gift Card",
      description:
        "Get full details for a specific Shopify gift card by ID. Returns code, initial value, current balance, customer, expiry, and creation timestamps.",
      inputSchema: {
        type: "object",
        properties: {
          gift_card_id: { type: "string", description: "Shopify gift card ID" },
        },
        required: ["gift_card_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, balance: { type: "string" }, initial_value: { type: "string" },
          currency: { type: "string" }, last_characters: { type: "string" }, disabled_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_gift_card",
      title: "Create Gift Card",
      description:
        "Create a new Shopify gift card with a specified initial value. Optionally set a custom code, expiry date, customer assignment, and staff note. The code is auto-generated if not provided. Returns the new gift card with its full code.",
      inputSchema: {
        type: "object",
        properties: {
          initial_value: { type: "string", description: "Initial monetary value (e.g. '25.00')" },
          code: { type: "string", description: "Custom code (8-20 alphanumeric chars; auto-generated if omitted)" },
          currency: { type: "string", description: "ISO 4217 currency code (defaults to shop currency)" },
          customer_id: { type: "number", description: "Customer ID to assign to" },
          expires_on: { type: "string", description: "Expiry date YYYY-MM-DD" },
          note: { type: "string", description: "Staff note" },
          template_suffix: { type: "string", description: "Theme template suffix" },
        },
        required: ["initial_value"],
      },
      outputSchema: {
        type: "object",
        properties: { id: { type: "number" }, code: { type: "string" }, initial_value: { type: "string" }, balance: { type: "string" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_gift_card",
      title: "Update Gift Card",
      description:
        "Update a Shopify gift card's expiry date, staff note, or template suffix. Note: the code and initial value cannot be changed after creation. Returns the updated gift card.",
      inputSchema: {
        type: "object",
        properties: {
          gift_card_id: { type: "string", description: "Shopify gift card ID" },
          expires_on: { type: "string", description: "Updated expiry date (YYYY-MM-DD)" },
          note: { type: "string", description: "Updated staff note" },
          template_suffix: { type: "string", description: "Updated template suffix" },
        },
        required: ["gift_card_id"],
      },
      outputSchema: {
        type: "object",
        properties: { id: { type: "number" }, expires_on: { type: "string" }, updated_at: { type: "string" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "disable_gift_card",
      title: "Disable Gift Card",
      description:
        "Disable a Shopify gift card, preventing it from being used for purchases. Disabled gift cards can be viewed but not redeemed. This action cannot be undone via API.",
      inputSchema: {
        type: "object",
        properties: {
          gift_card_id: { type: "string", description: "Shopify gift card ID to disable" },
        },
        required: ["gift_card_id"],
      },
      outputSchema: {
        type: "object",
        properties: { id: { type: "number" }, disabled_at: { type: "string" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_gift_cards: async (args) => {
      const params = ListGiftCardsSchema.parse(args);
      let result: { data: ShopifyGiftCard[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_gift_cards", () =>
          client.paginateFromCursor<ShopifyGiftCard>("/gift_cards.json", params.page_info!, params.limit)
        , { tool: "list_gift_cards" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.status) extraParams.status = params.status;

        result = await logger.time("tool.list_gift_cards", () =>
          client.paginatedGet<ShopifyGiftCard>("/gift_cards.json", extraParams, params.limit)
        , { tool: "list_gift_cards" });
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

    get_gift_card: async (args) => {
      const { gift_card_id } = GetGiftCardSchema.parse(args);
      const data = await logger.time("tool.get_gift_card", () =>
        client.get<{ gift_card: ShopifyGiftCard }>(`/gift_cards/${gift_card_id}.json`)
      , { tool: "get_gift_card", gift_card_id });

      const gift_card = (data as { gift_card: ShopifyGiftCard }).gift_card;

      return {
        content: [{ type: "text", text: JSON.stringify(gift_card, null, 2) }],
        structuredContent: gift_card,
      };
    },

    create_gift_card: async (args) => {
      const params = CreateGiftCardSchema.parse(args);
      const data = await logger.time("tool.create_gift_card", () =>
        client.post<{ gift_card: ShopifyGiftCard }>("/gift_cards.json", { gift_card: params })
      , { tool: "create_gift_card" });

      const gift_card = (data as { gift_card: ShopifyGiftCard }).gift_card;

      return {
        content: [{ type: "text", text: JSON.stringify(gift_card, null, 2) }],
        structuredContent: gift_card,
      };
    },

    update_gift_card: async (args) => {
      const { gift_card_id, ...updateData } = UpdateGiftCardSchema.parse(args);
      const data = await logger.time("tool.update_gift_card", () =>
        client.put<{ gift_card: ShopifyGiftCard }>(`/gift_cards/${gift_card_id}.json`, { gift_card: updateData })
      , { tool: "update_gift_card", gift_card_id });

      const gift_card = (data as { gift_card: ShopifyGiftCard }).gift_card;

      return {
        content: [{ type: "text", text: JSON.stringify(gift_card, null, 2) }],
        structuredContent: gift_card,
      };
    },

    disable_gift_card: async (args) => {
      const { gift_card_id } = DisableGiftCardSchema.parse(args);
      const data = await logger.time("tool.disable_gift_card", () =>
        client.post<{ gift_card: ShopifyGiftCard }>(`/gift_cards/${gift_card_id}/disable.json`, {})
      , { tool: "disable_gift_card", gift_card_id });

      const gift_card = (data as { gift_card: ShopifyGiftCard }).gift_card;

      return {
        content: [{ type: "text", text: JSON.stringify(gift_card, null, 2) }],
        structuredContent: gift_card,
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
