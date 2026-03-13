// Customers tools — Shopify Admin API 2024-01
// Covers: list_customers, get_customer, create_customer, update_customer,
//         search_customers, get_customer_orders, send_customer_invite, add_customer_tags

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler, ShopifyCustomer } from "../types.js";
import { logger } from "../logger.js";

// === Zod Schemas ===
const ListCustomersSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  query: z.string().optional().describe("Search by name, email, phone, or address"),
  created_at_min: z.string().optional().describe("Filter customers created after ISO 8601 date"),
  created_at_max: z.string().optional().describe("Filter customers created before ISO 8601 date"),
  page_info: z.string().optional().describe("Cursor for next page (from previous response nextPageInfo)"),
});

const GetCustomerSchema = z.object({
  customer_id: z.string().describe("Shopify customer ID"),
  include_orders: z.boolean().optional().default(false).describe("Include recent order history"),
});

const CreateCustomerSchema = z.object({
  first_name: z.string().optional().describe("Customer first name"),
  last_name: z.string().optional().describe("Customer last name"),
  email: z.string().email().describe("Customer email address (required, must be unique)"),
  phone: z.string().optional().describe("Customer phone number (E.164 format, e.g. +12125551234)"),
  note: z.string().optional().describe("Notes about the customer"),
  tags: z.string().optional().describe("Comma-separated tags"),
  verified_email: z.boolean().optional().default(true).describe("Whether email is verified (default: true)"),
  send_email_welcome: z.boolean().optional().default(false).describe("Send welcome email (default: false)"),
  addresses: z.array(z.object({
    address1: z.string().optional(),
    address2: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    default: z.boolean().optional(),
  })).optional().describe("Customer addresses"),
});

const UpdateCustomerSchema = z.object({
  customer_id: z.string().describe("Shopify customer ID"),
  first_name: z.string().optional().describe("Updated first name"),
  last_name: z.string().optional().describe("Updated last name"),
  email: z.string().email().optional().describe("Updated email address"),
  phone: z.string().optional().describe("Updated phone number"),
  note: z.string().optional().describe("Updated notes"),
  tags: z.string().optional().describe("Updated comma-separated tags"),
});

const SearchCustomersSchema = z.object({
  query: z.string().describe("Search query — supports email, name, phone, address. Examples: 'email:test@example.com', 'first_name:Jane last_name:Doe', 'tag:vip'"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  order: z.string().optional().describe("Sort order (e.g. 'last_order_date DESC', 'email ASC')"),
});

const GetCustomerOrdersSchema = z.object({
  customer_id: z.string().describe("Shopify customer ID"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  status: z.enum(["open", "closed", "cancelled", "any"]).optional().default("any").describe("Filter by order status"),
  page_info: z.string().optional().describe("Cursor for next page"),
});

const SendCustomerInviteSchema = z.object({
  customer_id: z.string().describe("Shopify customer ID"),
  to: z.string().email().optional().describe("Override recipient email (defaults to customer's email)"),
  from: z.string().email().optional().describe("Sender email (defaults to store email)"),
  bcc: z.array(z.string().email()).optional().describe("BCC recipient email addresses"),
  subject: z.string().optional().describe("Custom email subject line"),
  custom_message: z.string().optional().describe("Custom message body added to the account invite email"),
});

const AddCustomerTagsSchema = z.object({
  customer_id: z.string().describe("Shopify customer ID"),
  tags: z.array(z.string()).describe("Tags to add to the customer (existing tags are preserved)"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_customers",
      title: "List Customers",
      description:
        "List Shopify customers with optional search and date filters. Returns name, email, phone, order count, and total spent. Supports cursor-based pagination. The 'query' field searches across name, email, phone, and address fields.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          query: { type: "string", description: "Search by name, email, phone, or address" },
          created_at_min: { type: "string", description: "Filter customers created after ISO 8601 date" },
          created_at_max: { type: "string", description: "Filter customers created before ISO 8601 date" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: {
              count: { type: "number" },
              hasMore: { type: "boolean" },
              nextPageInfo: { type: "string" },
            },
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
      name: "get_customer",
      title: "Get Customer",
      description:
        "Get full details for a Shopify customer by ID. Returns contact info, addresses, order count, and total spent. Optionally includes recent order history. Use when the user references a specific customer ID or needs detailed customer info.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Shopify customer ID" },
          include_orders: { type: "boolean", description: "Include recent order history (default: false)" },
        },
        required: ["customer_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          orders_count: { type: "number" },
          total_spent: { type: "string" },
          addresses: { type: "array" },
          orders: { type: "array" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "create_customer",
      title: "Create Customer",
      description:
        "Create a new customer record in Shopify. Email is required and must be unique. Optionally add addresses and send a welcome email. Returns the created customer with assigned ID.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Customer email address (required, must be unique)" },
          first_name: { type: "string", description: "Customer first name" },
          last_name: { type: "string", description: "Customer last name" },
          phone: { type: "string", description: "Customer phone (E.164 format, e.g. +12125551234)" },
          note: { type: "string", description: "Notes about the customer" },
          tags: { type: "string", description: "Comma-separated tags" },
          verified_email: { type: "boolean", description: "Whether email is verified (default: true)" },
          send_email_welcome: { type: "boolean", description: "Send welcome email (default: false)" },
          addresses: { type: "array", description: "Customer addresses" },
        },
        required: ["email"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          email: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          created_at: { type: "string" },
        },
        required: ["id", "email"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "update_customer",
      title: "Update Customer",
      description:
        "Update an existing Shopify customer's fields. Only include fields to change. Returns the updated customer.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Shopify customer ID" },
          first_name: { type: "string", description: "Updated first name" },
          last_name: { type: "string", description: "Updated last name" },
          email: { type: "string", description: "Updated email address" },
          phone: { type: "string", description: "Updated phone number" },
          note: { type: "string", description: "Updated notes" },
          tags: { type: "string", description: "Updated comma-separated tags" },
        },
        required: ["customer_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          email: { type: "string" },
          updated_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "search_customers",
      title: "Search Customers",
      description:
        "Search Shopify customers using a full-text query. Supports field-specific searches like 'email:test@example.com', 'tag:vip', 'first_name:Jane'. More precise than list_customers query param — use for finding specific customers by email, name, phone, or tags. Returns matching customers with contact info and order stats.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (e.g. 'email:test@example.com', 'tag:vip', 'first_name:Jane')" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          order: { type: "string", description: "Sort order (e.g. 'last_order_date DESC')" },
        },
        required: ["query"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_customer_orders",
      title: "Get Customer Orders",
      description:
        "List all orders for a specific Shopify customer. Returns order number, financial status, fulfillment status, total price, and line items. Supports filtering by order status and cursor-based pagination. Use to review a customer's purchase history.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Shopify customer ID" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          status: { type: "string", enum: ["open", "closed", "cancelled", "any"], description: "Filter by order status" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
        required: ["customer_id"],
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
      name: "send_customer_invite",
      title: "Send Customer Account Invite",
      description:
        "Send an account activation (invite) email to a Shopify customer so they can set their password and access their account. Useful for newly created customers who haven't set up a password yet. Optionally customize the subject, message, sender, and BCC recipients.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Shopify customer ID" },
          to: { type: "string", description: "Override recipient email (defaults to customer's email)" },
          from: { type: "string", description: "Sender email (defaults to store email)" },
          bcc: { type: "array", items: { type: "string" }, description: "BCC recipients" },
          subject: { type: "string", description: "Custom email subject" },
          custom_message: { type: "string", description: "Custom message body" },
        },
        required: ["customer_id"],
      },
      outputSchema: {
        type: "object",
        properties: { customer_id: { type: "string" }, sent: { type: "boolean" }, to: { type: "string" } },
        required: ["sent"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "add_customer_tags",
      title: "Add Customer Tags",
      description:
        "Add one or more tags to a Shopify customer without removing existing tags. Tags are used for customer segmentation, marketing lists, and discount targeting. Returns the customer with updated full tag list.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Shopify customer ID" },
          tags: { type: "array", items: { type: "string" }, description: "Tags to add (existing tags are preserved)" },
        },
        required: ["customer_id", "tags"],
      },
      outputSchema: {
        type: "object",
        properties: { id: { type: "number" }, tags: { type: "string" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_customers: async (args) => {
      const params = ListCustomersSchema.parse(args);

      let result: { data: ShopifyCustomer[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_customers", () =>
          client.paginateFromCursor<ShopifyCustomer>("/customers.json", params.page_info!, params.limit)
        , { tool: "list_customers" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.query) extraParams.query = params.query;
        if (params.created_at_min) extraParams.created_at_min = params.created_at_min;
        if (params.created_at_max) extraParams.created_at_max = params.created_at_max;

        result = await logger.time("tool.list_customers", () =>
          client.paginatedGet<ShopifyCustomer>("/customers.json", extraParams, params.limit)
        , { tool: "list_customers" });
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

    get_customer: async (args) => {
      const { customer_id, include_orders } = GetCustomerSchema.parse(args);

      const data = await logger.time("tool.get_customer", () =>
        client.get<{ customer: ShopifyCustomer }>(`/customers/${customer_id}.json`)
      , { tool: "get_customer", customer_id });

      const customer = (data as { customer: ShopifyCustomer }).customer;

      // Optionally fetch order history
      let orders: unknown[] = [];
      if (include_orders) {
        try {
          const ordersData = await client.paginatedGet<unknown>(
            `/customers/${customer_id}/orders.json`,
            { status: "any" },
            10
          );
          orders = ordersData.data;
        } catch (_e) {
          // Non-fatal: order history is optional
        }
      }

      const result = { ...customer, ...(include_orders ? { orders } : {}) };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },

    create_customer: async (args) => {
      const params = CreateCustomerSchema.parse(args);
      const data = await logger.time("tool.create_customer", () =>
        client.post<{ customer: ShopifyCustomer }>("/customers.json", { customer: params })
      , { tool: "create_customer" });

      const customer = (data as { customer: ShopifyCustomer }).customer;

      return {
        content: [{ type: "text", text: JSON.stringify(customer, null, 2) }],
        structuredContent: customer,
      };
    },

    update_customer: async (args) => {
      const { customer_id, ...updateData } = UpdateCustomerSchema.parse(args);
      const data = await logger.time("tool.update_customer", () =>
        client.put<{ customer: ShopifyCustomer }>(`/customers/${customer_id}.json`, { customer: updateData })
      , { tool: "update_customer", customer_id });

      const customer = (data as { customer: ShopifyCustomer }).customer;

      return {
        content: [{ type: "text", text: JSON.stringify(customer, null, 2) }],
        structuredContent: customer,
      };
    },

    search_customers: async (args) => {
      const { query, limit, order } = SearchCustomersSchema.parse(args);
      const params: Record<string, string> = { query };
      if (limit) params.limit = String(limit);
      if (order) params.order = order;

      const data = await logger.time("tool.search_customers", () =>
        client.get<{ customers: ShopifyCustomer[] }>(
          `/customers/search.json?${new URLSearchParams(params)}`
        )
      , { tool: "search_customers" });

      const customers = (data as { customers: ShopifyCustomer[] }).customers || [];
      const response = { data: customers, meta: { count: customers.length } };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_customer_orders: async (args) => {
      const { customer_id, limit, status, page_info } = GetCustomerOrdersSchema.parse(args);
      let result: { data: unknown[]; nextPageInfo?: string };

      if (page_info) {
        result = await logger.time("tool.get_customer_orders", () =>
          client.paginateFromCursor<unknown>(
            `/customers/${customer_id}/orders.json`,
            page_info,
            limit
          )
        , { tool: "get_customer_orders" });
      } else {
        const extraParams: Record<string, string> = {};
        if (status) extraParams.status = status;

        result = await logger.time("tool.get_customer_orders", () =>
          client.paginatedGet<unknown>(
            `/customers/${customer_id}/orders.json`,
            extraParams,
            limit
          )
        , { tool: "get_customer_orders", customer_id });
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

    send_customer_invite: async (args) => {
      const { customer_id, ...inviteData } = SendCustomerInviteSchema.parse(args);
      const body: Record<string, unknown> = {};
      if (inviteData.to) body.to = inviteData.to;
      if (inviteData.from) body.from = inviteData.from;
      if (inviteData.bcc) body.bcc = inviteData.bcc;
      if (inviteData.subject) body.subject = inviteData.subject;
      if (inviteData.custom_message) body.custom_message = inviteData.custom_message;

      await logger.time("tool.send_customer_invite", () =>
        client.post<unknown>(
          `/customers/${customer_id}/send_invite.json`,
          { customer_invite: body }
        )
      , { tool: "send_customer_invite", customer_id });

      const response = { customer_id, sent: true, to: inviteData.to };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    add_customer_tags: async (args) => {
      const { customer_id, tags } = AddCustomerTagsSchema.parse(args);

      // First, fetch current tags to merge
      const existingData = await logger.time("tool.add_customer_tags.fetch", () =>
        client.get<{ customer: ShopifyCustomer }>(`/customers/${customer_id}.json`)
      , { tool: "add_customer_tags", customer_id });

      const existing = (existingData as { customer: ShopifyCustomer }).customer;
      const existingTags = existing.tags
        ? existing.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      // Merge new tags (deduplicate)
      const merged = Array.from(new Set([...existingTags, ...tags])).join(", ");

      const data = await logger.time("tool.add_customer_tags.update", () =>
        client.put<{ customer: ShopifyCustomer }>(
          `/customers/${customer_id}.json`,
          { customer: { tags: merged } }
        )
      , { tool: "add_customer_tags", customer_id });

      const customer = (data as { customer: ShopifyCustomer }).customer;

      return {
        content: [{ type: "text", text: JSON.stringify(customer, null, 2) }],
        structuredContent: customer,
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
