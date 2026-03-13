// Reports tools — Shopify Admin API 2024-01
// Covers: list_reports, get_report, create_report, update_report, delete_report

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyReport {
  id: number;
  name: string;
  shopify_ql?: string;
  updated_at?: string;
  category?: string;
}

// === Zod Schemas ===
const ListReportsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  since_id: z.string().optional(),
  updated_at_min: z.string().optional(),
  updated_at_max: z.string().optional(),
  fields: z.string().optional().describe("Comma-separated fields to return"),
});

const GetReportSchema = z.object({
  report_id: z.string(),
  fields: z.string().optional(),
});

const CreateReportSchema = z.object({
  name: z.string().describe("Report name shown in Shopify admin"),
  shopify_ql: z.string().describe("ShopifyQL query that defines the report data"),
});

const UpdateReportSchema = z.object({
  report_id: z.string(),
  name: z.string().optional(),
  shopify_ql: z.string().optional(),
});

const DeleteReportSchema = z.object({ report_id: z.string() });

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_reports",
      title: "List Reports",
      description: "List custom analytics reports in the store. Reports are defined using ShopifyQL queries and appear in the Shopify admin analytics section.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          page_info: { type: "string" },
          since_id: { type: "string" },
          updated_at_min: { type: "string" },
          updated_at_max: { type: "string" },
          fields: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_report",
      title: "Get Report",
      description: "Get a specific report by ID, including its ShopifyQL query.",
      inputSchema: {
        type: "object",
        properties: {
          report_id: { type: "string" },
          fields: { type: "string" },
        },
        required: ["report_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_report",
      title: "Create Report",
      description: "Create a custom analytics report using a ShopifyQL query. The report will appear in the Shopify admin analytics section.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          shopify_ql: { type: "string", description: "ShopifyQL query (e.g. 'SHOW total_sales BY month')" },
        },
        required: ["name", "shopify_ql"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_report",
      title: "Update Report",
      description: "Update a custom report's name or ShopifyQL query.",
      inputSchema: {
        type: "object",
        properties: {
          report_id: { type: "string" },
          name: { type: "string" },
          shopify_ql: { type: "string" },
        },
        required: ["report_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_report",
      title: "Delete Report",
      description: "Permanently delete a custom report.",
      inputSchema: {
        type: "object",
        properties: { report_id: { type: "string" } },
        required: ["report_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_reports: async (args) => {
      const params = ListReportsSchema.parse(args);
      let result: { data: ShopifyReport[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_reports", () =>
          client.paginateFromCursor<ShopifyReport>("/reports.json", params.page_info!, params.limit)
        , { tool: "list_reports" });
      } else {
        const extra: Record<string, string> = {};
        if (params.since_id) extra.since_id = params.since_id;
        if (params.updated_at_min) extra.updated_at_min = params.updated_at_min;
        if (params.updated_at_max) extra.updated_at_max = params.updated_at_max;
        if (params.fields) extra.fields = params.fields;
        result = await logger.time("tool.list_reports", () =>
          client.paginatedGet<ShopifyReport>("/reports.json", extra, params.limit)
        , { tool: "list_reports" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_report: async (args) => {
      const { report_id, fields } = GetReportSchema.parse(args);
      const qs = fields ? `?fields=${encodeURIComponent(fields)}` : "";
      const data = await logger.time("tool.get_report", () =>
        client.get<{ report: ShopifyReport }>(`/reports/${report_id}.json${qs}`)
      , { tool: "get_report" });
      const report = (data as { report: ShopifyReport }).report;
      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }], structuredContent: report };
    },

    create_report: async (args) => {
      const params = CreateReportSchema.parse(args);
      const data = await logger.time("tool.create_report", () =>
        client.post<{ report: ShopifyReport }>("/reports.json", { report: params })
      , { tool: "create_report" });
      const report = (data as { report: ShopifyReport }).report;
      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }], structuredContent: report };
    },

    update_report: async (args) => {
      const { report_id, ...updateData } = UpdateReportSchema.parse(args);
      const data = await logger.time("tool.update_report", () =>
        client.put<{ report: ShopifyReport }>(`/reports/${report_id}.json`, { report: updateData })
      , { tool: "update_report" });
      const report = (data as { report: ShopifyReport }).report;
      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }], structuredContent: report };
    },

    delete_report: async (args) => {
      const { report_id } = DeleteReportSchema.parse(args);
      await logger.time("tool.delete_report", () =>
        client.delete<unknown>(`/reports/${report_id}.json`)
      , { tool: "delete_report" });
      const response = { success: true, report_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
