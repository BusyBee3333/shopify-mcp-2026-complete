// Events tools — Shopify Admin API 2024-01
// Covers: list_events, get_event
// Events are the Shopify store activity log — product updates, order creation, customer actions, etc.

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyEvent {
  id?: number;
  subject_id?: number;
  subject_type?: string;
  verb?: string;
  arguments?: unknown[];
  body?: string | null;
  message?: string;
  author?: string;
  description?: string;
  path?: string;
  created_at?: string;
}

// === Zod Schemas ===
const ListEventsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
  filter: z.string().optional().describe("Filter by subject type (e.g. 'Order', 'Product', 'Customer', 'Collection', 'Variant', 'Article')"),
  verb: z.string().optional().describe("Filter by verb/action (e.g. 'confirmed', 'placed', 'updated', 'created', 'destroyed')"),
  created_at_min: z.string().optional().describe("Filter events created after ISO 8601 date"),
  created_at_max: z.string().optional().describe("Filter events created before ISO 8601 date"),
  since_id: z.string().optional().describe("Return events with ID greater than this"),
});

const GetEventSchema = z.object({
  event_id: z.string().describe("Shopify event ID"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_events",
      title: "List Events",
      description:
        "List events from the Shopify store activity log. Events record actions like order placement, product updates, customer creation, and more. Returns subject type, verb/action, description, author, and timestamp. Useful for auditing store activity, debugging, or building activity feeds. Supports filtering by subject type, verb, and date range.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          filter: { type: "string", description: "Filter by subject type (e.g. 'Order', 'Product', 'Customer')" },
          verb: { type: "string", description: "Filter by action verb (e.g. 'confirmed', 'created', 'updated')" },
          created_at_min: { type: "string", description: "Filter events created after ISO 8601 date" },
          created_at_max: { type: "string", description: "Filter events created before ISO 8601 date" },
          since_id: { type: "string", description: "Return events with ID greater than this" },
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
      name: "get_event",
      title: "Get Event",
      description:
        "Get full details for a specific Shopify event by ID. Returns the subject type and ID, action verb, human-readable message, author, and path to the affected resource.",
      inputSchema: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Shopify event ID" },
        },
        required: ["event_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, subject_type: { type: "string" }, subject_id: { type: "number" },
          verb: { type: "string" }, message: { type: "string" }, author: { type: "string" },
          created_at: { type: "string" }, path: { type: "string" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_events: async (args) => {
      const params = ListEventsSchema.parse(args);
      let result: { data: ShopifyEvent[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_events", () =>
          client.paginateFromCursor<ShopifyEvent>("/events.json", params.page_info!, params.limit)
        , { tool: "list_events" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.filter) extraParams.filter = params.filter;
        if (params.verb) extraParams.verb = params.verb;
        if (params.created_at_min) extraParams.created_at_min = params.created_at_min;
        if (params.created_at_max) extraParams.created_at_max = params.created_at_max;
        if (params.since_id) extraParams.since_id = params.since_id;

        result = await logger.time("tool.list_events", () =>
          client.paginatedGet<ShopifyEvent>("/events.json", extraParams, params.limit)
        , { tool: "list_events" });
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

    get_event: async (args) => {
      const { event_id } = GetEventSchema.parse(args);
      const data = await logger.time("tool.get_event", () =>
        client.get<{ event: ShopifyEvent }>(`/events/${event_id}.json`)
      , { tool: "get_event", event_id });

      const event = (data as { event: ShopifyEvent }).event;

      return {
        content: [{ type: "text", text: JSON.stringify(event, null, 2) }],
        structuredContent: event,
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
