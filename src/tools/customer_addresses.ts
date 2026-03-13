// Customer Addresses tools — Shopify Admin API 2024-01
// Covers: list_customer_addresses, get_customer_address, create_customer_address,
//         update_customer_address, delete_customer_address, set_default_customer_address

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyAddress {
  id: number;
  customer_id?: number;
  first_name?: string;
  last_name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  province_code?: string;
  country?: string;
  country_code?: string;
  zip?: string;
  phone?: string;
  name?: string;
  default?: boolean;
}

// === Zod Schemas ===
const ListCustomerAddressesSchema = z.object({
  customer_id: z.string().describe("Customer ID"),
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
});

const GetCustomerAddressSchema = z.object({
  customer_id: z.string(),
  address_id: z.string(),
});

const AddressFieldsSchema = {
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional().nullable(),
  address1: z.string().optional(),
  address2: z.string().optional().nullable(),
  city: z.string().optional(),
  province: z.string().optional().describe("Province/state name"),
  province_code: z.string().optional().describe("Province/state code (e.g. 'CA', 'NY')"),
  country: z.string().optional().describe("Country name"),
  country_code: z.string().optional().describe("ISO country code (e.g. 'US', 'CA')"),
  zip: z.string().optional(),
  phone: z.string().optional().nullable(),
};

const CreateCustomerAddressSchema = z.object({
  customer_id: z.string(),
  ...AddressFieldsSchema,
});

const UpdateCustomerAddressSchema = z.object({
  customer_id: z.string(),
  address_id: z.string(),
  ...AddressFieldsSchema,
});

const DeleteCustomerAddressSchema = z.object({
  customer_id: z.string(),
  address_id: z.string(),
});

const SetDefaultAddressSchema = z.object({
  customer_id: z.string(),
  address_id: z.string(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_customer_addresses",
      title: "List Customer Addresses",
      description: "List all addresses saved for a customer. Returns address fields plus which one is the default shipping address.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          limit: { type: "number" },
          page_info: { type: "string" },
        },
        required: ["customer_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_customer_address",
      title: "Get Customer Address",
      description: "Get a specific address for a customer by address ID.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          address_id: { type: "string" },
        },
        required: ["customer_id", "address_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_customer_address",
      title: "Create Customer Address",
      description: "Add a new address to a customer's address book. Supports full international address fields.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          company: { type: "string" },
          address1: { type: "string" },
          address2: { type: "string" },
          city: { type: "string" },
          province: { type: "string" },
          province_code: { type: "string" },
          country: { type: "string" },
          country_code: { type: "string" },
          zip: { type: "string" },
          phone: { type: "string" },
        },
        required: ["customer_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_customer_address",
      title: "Update Customer Address",
      description: "Update fields on an existing customer address. Only include fields you want to change.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          address_id: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          company: { type: "string" },
          address1: { type: "string" },
          address2: { type: "string" },
          city: { type: "string" },
          province: { type: "string" },
          province_code: { type: "string" },
          country: { type: "string" },
          country_code: { type: "string" },
          zip: { type: "string" },
          phone: { type: "string" },
        },
        required: ["customer_id", "address_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_customer_address",
      title: "Delete Customer Address",
      description: "Remove an address from a customer's address book. Cannot delete the default address.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          address_id: { type: "string" },
        },
        required: ["customer_id", "address_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "set_default_customer_address",
      title: "Set Default Customer Address",
      description: "Set an address as the default shipping address for a customer.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          address_id: { type: "string" },
        },
        required: ["customer_id", "address_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_customer_addresses: async (args) => {
      const params = ListCustomerAddressesSchema.parse(args);
      let result: { data: ShopifyAddress[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_customer_addresses", () =>
          client.paginateFromCursor<ShopifyAddress>(`/customers/${params.customer_id}/addresses.json`, params.page_info!, params.limit)
        , { tool: "list_customer_addresses" });
      } else {
        result = await logger.time("tool.list_customer_addresses", () =>
          client.paginatedGet<ShopifyAddress>(`/customers/${params.customer_id}/addresses.json`, {}, params.limit)
        , { tool: "list_customer_addresses" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_customer_address: async (args) => {
      const { customer_id, address_id } = GetCustomerAddressSchema.parse(args);
      const data = await logger.time("tool.get_customer_address", () =>
        client.get<{ customer_address: ShopifyAddress }>(`/customers/${customer_id}/addresses/${address_id}.json`)
      , { tool: "get_customer_address" });
      const address = (data as { customer_address: ShopifyAddress }).customer_address;
      return { content: [{ type: "text", text: JSON.stringify(address, null, 2) }], structuredContent: address };
    },

    create_customer_address: async (args) => {
      const { customer_id, ...addressData } = CreateCustomerAddressSchema.parse(args);
      const data = await logger.time("tool.create_customer_address", () =>
        client.post<{ customer_address: ShopifyAddress }>(`/customers/${customer_id}/addresses.json`, { address: addressData })
      , { tool: "create_customer_address" });
      const address = (data as { customer_address: ShopifyAddress }).customer_address;
      return { content: [{ type: "text", text: JSON.stringify(address, null, 2) }], structuredContent: address };
    },

    update_customer_address: async (args) => {
      const { customer_id, address_id, ...updateData } = UpdateCustomerAddressSchema.parse(args);
      const data = await logger.time("tool.update_customer_address", () =>
        client.put<{ customer_address: ShopifyAddress }>(`/customers/${customer_id}/addresses/${address_id}.json`, { address: updateData })
      , { tool: "update_customer_address" });
      const address = (data as { customer_address: ShopifyAddress }).customer_address;
      return { content: [{ type: "text", text: JSON.stringify(address, null, 2) }], structuredContent: address };
    },

    delete_customer_address: async (args) => {
      const { customer_id, address_id } = DeleteCustomerAddressSchema.parse(args);
      await logger.time("tool.delete_customer_address", () =>
        client.delete<unknown>(`/customers/${customer_id}/addresses/${address_id}.json`)
      , { tool: "delete_customer_address" });
      const response = { success: true, address_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    set_default_customer_address: async (args) => {
      const { customer_id, address_id } = SetDefaultAddressSchema.parse(args);
      const data = await logger.time("tool.set_default_customer_address", () =>
        client.put<{ customer_address: ShopifyAddress }>(`/customers/${customer_id}/addresses/${address_id}/default.json`, {})
      , { tool: "set_default_customer_address" });
      const address = (data as { customer_address: ShopifyAddress }).customer_address;
      return { content: [{ type: "text", text: JSON.stringify(address, null, 2) }], structuredContent: address };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
