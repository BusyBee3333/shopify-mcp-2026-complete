// Marketing Events tools — Shopify Admin API 2024-01
// Covers: list_marketing_events, get_marketing_event, create_marketing_event,
//         update_marketing_event, delete_marketing_event, create_marketing_event_engagements

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyMarketingEvent {
  id: number;
  event_type: string;
  marketing_channel: string;
  paid?: boolean;
  referring_domain?: string | null;
  budget?: string | null;
  budget_type?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  currency?: string | null;
  description?: string | null;
  utm_parameters?: Record<string, string>;
  remote_id?: string | null;
  marketed_resources?: unknown[];
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListMarketingEventsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  event_type: z.string().optional().describe("Filter by event type"),
  marketing_channel: z.string().optional().describe("Filter by channel"),
});

const GetMarketingEventSchema = z.object({ marketing_event_id: z.string() });

const CreateMarketingEventSchema = z.object({
  event_type: z.enum(["ad", "post", "message", "retargeting", "transactional", "affiliate", "loyalty", "newsletter", "abandoned_cart"]).describe("Type of marketing event"),
  marketing_channel: z.enum(["search", "display", "social", "email", "referral", "sms"]).describe("Marketing channel"),
  paid: z.boolean().optional().describe("Whether this is a paid campaign"),
  referring_domain: z.string().optional().nullable(),
  budget: z.string().optional().nullable().describe("Campaign budget amount"),
  budget_type: z.enum(["daily", "weekly", "monthly", "lifetime"]).optional().nullable(),
  started_at: z.string().optional().nullable().describe("ISO8601 campaign start date"),
  ended_at: z.string().optional().nullable().describe("ISO8601 campaign end date"),
  currency: z.string().optional().nullable().describe("ISO 3-letter currency code"),
  description: z.string().optional().nullable(),
  utm_parameters: z.record(z.string()).optional().describe("UTM parameters (source, medium, campaign, etc.)"),
  remote_id: z.string().optional().nullable().describe("External system ID"),
});

const UpdateMarketingEventSchema = z.object({
  marketing_event_id: z.string(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  budget: z.string().optional(),
  description: z.string().optional(),
});

const DeleteMarketingEventSchema = z.object({ marketing_event_id: z.string() });

const CreateEngagementsSchema = z.object({
  marketing_event_id: z.string(),
  occurred_on: z.string().describe("Date (YYYY-MM-DD)"),
  impressions_count: z.number().optional(),
  views_count: z.number().optional(),
  clicks_count: z.number().optional(),
  shares_count: z.number().optional(),
  favorites_count: z.number().optional(),
  comments_count: z.number().optional(),
  ad_spend: z.string().optional().describe("Amount spent on ads"),
  is_cumulative: z.boolean().optional().describe("Whether stats are cumulative from start"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_marketing_events",
      title: "List Marketing Events",
      description: "List marketing campaign events. Used to track advertising campaigns, email blasts, social posts and correlate them with sales. Supports cursor pagination.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          event_type: { type: "string" },
          marketing_channel: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_marketing_event",
      title: "Get Marketing Event",
      description: "Get details for a specific marketing event by ID.",
      inputSchema: {
        type: "object",
        properties: { marketing_event_id: { type: "string" } },
        required: ["marketing_event_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_marketing_event",
      title: "Create Marketing Event",
      description: "Create a marketing event to track a campaign. Use this to associate ads, emails, or social posts with orders via UTM parameters.",
      inputSchema: {
        type: "object",
        properties: {
          event_type: { type: "string", enum: ["ad", "post", "message", "retargeting", "transactional", "affiliate", "loyalty", "newsletter", "abandoned_cart"] },
          marketing_channel: { type: "string", enum: ["search", "display", "social", "email", "referral", "sms"] },
          paid: { type: "boolean" },
          referring_domain: { type: "string" },
          budget: { type: "string" },
          budget_type: { type: "string" },
          started_at: { type: "string" },
          ended_at: { type: "string" },
          currency: { type: "string" },
          description: { type: "string" },
          utm_parameters: { type: "object" },
          remote_id: { type: "string" },
        },
        required: ["event_type", "marketing_channel"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_marketing_event",
      title: "Update Marketing Event",
      description: "Update a marketing event's dates, budget, or description.",
      inputSchema: {
        type: "object",
        properties: {
          marketing_event_id: { type: "string" },
          started_at: { type: "string" },
          ended_at: { type: "string" },
          budget: { type: "string" },
          description: { type: "string" },
        },
        required: ["marketing_event_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_marketing_event",
      title: "Delete Marketing Event",
      description: "Delete a marketing event.",
      inputSchema: {
        type: "object",
        properties: { marketing_event_id: { type: "string" } },
        required: ["marketing_event_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "create_marketing_event_engagements",
      title: "Create Marketing Event Engagements",
      description: "Log engagement statistics (impressions, clicks, shares, ad spend) for a marketing event on a specific date.",
      inputSchema: {
        type: "object",
        properties: {
          marketing_event_id: { type: "string" },
          occurred_on: { type: "string", description: "Date (YYYY-MM-DD)" },
          impressions_count: { type: "number" },
          views_count: { type: "number" },
          clicks_count: { type: "number" },
          shares_count: { type: "number" },
          favorites_count: { type: "number" },
          comments_count: { type: "number" },
          ad_spend: { type: "string" },
          is_cumulative: { type: "boolean" },
        },
        required: ["marketing_event_id", "occurred_on"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_marketing_events: async (args) => {
      const params = ListMarketingEventsSchema.parse(args);
      let result: { data: ShopifyMarketingEvent[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_marketing_events", () =>
          client.paginateFromCursor<ShopifyMarketingEvent>("/marketing_events.json", params.page_info!, params.limit)
        , { tool: "list_marketing_events" });
      } else {
        const extra: Record<string, string> = {};
        if (params.event_type) extra.event_type = params.event_type;
        if (params.marketing_channel) extra.marketing_channel = params.marketing_channel;
        result = await logger.time("tool.list_marketing_events", () =>
          client.paginatedGet<ShopifyMarketingEvent>("/marketing_events.json", extra, params.limit)
        , { tool: "list_marketing_events" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_marketing_event: async (args) => {
      const { marketing_event_id } = GetMarketingEventSchema.parse(args);
      const data = await logger.time("tool.get_marketing_event", () =>
        client.get<{ marketing_event: ShopifyMarketingEvent }>(`/marketing_events/${marketing_event_id}.json`)
      , { tool: "get_marketing_event" });
      const event = (data as { marketing_event: ShopifyMarketingEvent }).marketing_event;
      return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }], structuredContent: event };
    },

    create_marketing_event: async (args) => {
      const params = CreateMarketingEventSchema.parse(args);
      const data = await logger.time("tool.create_marketing_event", () =>
        client.post<{ marketing_event: ShopifyMarketingEvent }>("/marketing_events.json", { marketing_event: params })
      , { tool: "create_marketing_event" });
      const event = (data as { marketing_event: ShopifyMarketingEvent }).marketing_event;
      return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }], structuredContent: event };
    },

    update_marketing_event: async (args) => {
      const { marketing_event_id, ...updateData } = UpdateMarketingEventSchema.parse(args);
      const data = await logger.time("tool.update_marketing_event", () =>
        client.put<{ marketing_event: ShopifyMarketingEvent }>(`/marketing_events/${marketing_event_id}.json`, { marketing_event: updateData })
      , { tool: "update_marketing_event" });
      const event = (data as { marketing_event: ShopifyMarketingEvent }).marketing_event;
      return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }], structuredContent: event };
    },

    delete_marketing_event: async (args) => {
      const { marketing_event_id } = DeleteMarketingEventSchema.parse(args);
      await logger.time("tool.delete_marketing_event", () =>
        client.delete<unknown>(`/marketing_events/${marketing_event_id}.json`)
      , { tool: "delete_marketing_event" });
      const response = { success: true, marketing_event_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    create_marketing_event_engagements: async (args) => {
      const { marketing_event_id, ...engagementData } = CreateEngagementsSchema.parse(args);
      const data = await logger.time("tool.create_marketing_event_engagements", () =>
        client.post<unknown>(`/marketing_events/${marketing_event_id}/engagements.json`, { engagements: [engagementData] })
      , { tool: "create_marketing_event_engagements" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
