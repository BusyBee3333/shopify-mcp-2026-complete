// Segments tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_segments, get_segment, create_segment, update_segment, delete_segment, list_segment_members, count_segment_members

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListSegmentsSchema = z.object({
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
  query: z.string().optional().describe("Filter segments by name"),
  sortKey: z.enum(["CREATION_DATE", "NAME", "LAST_EDIT_DATE"]).optional().default("CREATION_DATE"),
});

const GetSegmentSchema = z.object({
  id: z.string().describe("Segment GID"),
});

const CreateSegmentSchema = z.object({
  name: z.string().describe("Segment name"),
  query: z.string().describe("ShopifyQL query defining the segment (e.g. 'customer_tags CONTAINS \"VIP\" AND orders_count > 5')"),
});

const UpdateSegmentSchema = z.object({
  id: z.string().describe("Segment GID"),
  name: z.string().optional().describe("New segment name"),
  query: z.string().optional().describe("New ShopifyQL query"),
});

const DeleteSegmentSchema = z.object({
  id: z.string().describe("Segment GID to delete"),
});

const ListSegmentMembersSchema = z.object({
  segmentId: z.string().describe("Segment GID"),
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
});

const CountSegmentMembersSchema = z.object({
  segmentId: z.string().describe("Segment GID"),
});

const ListSegmentFiltersSchema = z.object({});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_segments",
      title: "List Customer Segments",
      description: "List all customer segments on the store. Segments are dynamic customer groups defined by ShopifyQL queries. Returns segment GIDs, names, queries, and customer counts.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
          query: { type: "string", description: "Filter by segment name" },
          sortKey: { type: "string", enum: ["CREATION_DATE", "NAME", "LAST_EDIT_DATE"], description: "Sort order" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_segment",
      title: "Get Customer Segment",
      description: "Get a specific customer segment by GID. Returns name, ShopifyQL query, customer count, and creation date.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Segment GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_segment",
      title: "Create Customer Segment",
      description: "Create a new customer segment using a ShopifyQL query. Segments are dynamic — they update automatically as customer data changes. Example query: 'email_subscription_status = \"SUBSCRIBED\" AND orders_count >= 2'",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Segment name" },
          query: { type: "string", description: "ShopifyQL query (e.g. 'customer_tags CONTAINS \"VIP\"')" },
        },
        required: ["name", "query"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_segment",
      title: "Update Customer Segment",
      description: "Update a customer segment name or ShopifyQL query.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Segment GID" },
          name: { type: "string", description: "New name" },
          query: { type: "string", description: "New ShopifyQL query" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_segment",
      title: "Delete Customer Segment",
      description: "Delete a customer segment. This does not delete any customers.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Segment GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_segment_members",
      title: "List Segment Members",
      description: "List customers who are members of a specific segment. Returns customer GIDs, names, emails, and order counts.",
      inputSchema: {
        type: "object",
        properties: {
          segmentId: { type: "string", description: "Segment GID" },
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
        },
        required: ["segmentId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "count_segment_members",
      title: "Count Segment Members",
      description: "Get the total number of customers in a segment without fetching all members. Useful for segment sizing before targeting campaigns.",
      inputSchema: {
        type: "object",
        properties: { segmentId: { type: "string", description: "Segment GID" } },
        required: ["segmentId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_segment_filters",
      title: "List Segment Filters",
      description: "List available filters for building ShopifyQL segment queries. Returns filter names, types, and accepted values to help construct valid segment queries.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown> = {}) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    list_segments: async (args) => {
      const { first, after, query, sortKey } = ListSegmentsSchema.parse(args);
      const q = `query($first:Int!,$after:String,$query:String,$sortKey:SegmentSortKeys){segments(first:$first,after:$after,query:$query,sortKey:$sortKey){edges{node{id name query createdAt updatedAt}}pageInfo{hasNextPage endCursor}}}`;
      const data = await logger.time("tool.list_segments", () => gql(q, { first, after, query, sortKey }), { tool: "list_segments" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    get_segment: async (args) => {
      const { id } = GetSegmentSchema.parse(args);
      const q = `query($id:ID!){segment(id:$id){id name query createdAt updatedAt}}`;
      const data = await logger.time("tool.get_segment", () => gql(q, { id }), { tool: "get_segment" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    create_segment: async (args) => {
      const params = CreateSegmentSchema.parse(args);
      const q = `mutation segmentCreate($name:String!,$query:String!){segmentCreate(name:$name,query:$query){segment{id name query}userErrors{field message}}}`;
      const data = await logger.time("tool.create_segment", () => gql(q, params), { tool: "create_segment" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    update_segment: async (args) => {
      const { id, name, query } = UpdateSegmentSchema.parse(args);
      const q = `mutation segmentUpdate($id:ID!,$name:String,$query:String){segmentUpdate(id:$id,name:$name,query:$query){segment{id name query}userErrors{field message}}}`;
      const data = await logger.time("tool.update_segment", () => gql(q, { id, name, query }), { tool: "update_segment" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    delete_segment: async (args) => {
      const { id } = DeleteSegmentSchema.parse(args);
      const q = `mutation segmentDelete($id:ID!){segmentDelete(id:$id){deletedSegmentId userErrors{field message}}}`;
      const data = await logger.time("tool.delete_segment", () => gql(q, { id }), { tool: "delete_segment" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    list_segment_members: async (args) => {
      const { segmentId, first, after } = ListSegmentMembersSchema.parse(args);
      const q = `query($segmentId:ID!,$first:Int!,$after:String){segment(id:$segmentId){id name members(first:$first,after:$after){edges{node{id displayName email ordersCount{count}}}pageInfo{hasNextPage endCursor}}}}`;
      const data = await logger.time("tool.list_segment_members", () => gql(q, { segmentId, first, after }), { tool: "list_segment_members" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    count_segment_members: async (args) => {
      const { segmentId } = CountSegmentMembersSchema.parse(args);
      const q = `query($segmentId:ID!){segment(id:$segmentId){id name membersCount{count}}}`;
      const data = await logger.time("tool.count_segment_members", () => gql(q, { segmentId }), { tool: "count_segment_members" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    list_segment_filters: async (_args) => {
      const q = `query{segmentFilterSuggestions{filters{localizedName queryName filterType returnValueType ... on SegmentMembershipFilter{} ... on SegmentStringFilter{}}}}`;
      const data = await logger.time("tool.list_segment_filters", () => gql(q, {}), { tool: "list_segment_filters" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
