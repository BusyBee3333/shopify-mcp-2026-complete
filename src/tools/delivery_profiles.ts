// Delivery Profiles tools — Shopify Admin API 2024-01
// Covers: list_delivery_profiles, get_delivery_profile, create_delivery_profile, update_delivery_profile, delete_delivery_profile

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyDeliveryProfile {
  id?: number;
  name?: string;
  profile_type?: string;
  is_published?: boolean;
  created_at?: string;
  updated_at?: string;
  location_groups?: unknown[];
  zone_counts?: unknown[];
}

const ListDeliveryProfilesSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250)"),
  page_info: z.string().optional().describe("Cursor for next page"),
});

const GetDeliveryProfileSchema = z.object({
  delivery_profile_id: z.string().describe("Delivery profile ID"),
});

const CreateDeliveryProfileSchema = z.object({
  name: z.string().describe("Name of the delivery profile"),
  location_groups: z.array(z.object({
    locations: z.array(z.object({
      id: z.number().describe("Location ID"),
    })).optional(),
    zones: z.array(z.object({
      name: z.string().describe("Zone name"),
      countries: z.array(z.object({
        code: z.string().describe("ISO country code"),
        provinces: z.array(z.object({
          code: z.string().describe("Province/state code"),
        })).optional(),
      })).optional(),
      method_definitions: z.array(z.object({
        name: z.string().describe("Method name"),
        rateDefinition: z.object({
          price: z.object({
            amount: z.string().describe("Shipping price"),
            currencyCode: z.string().describe("Currency code"),
          }),
        }).optional(),
      })).optional(),
    })).optional(),
  })).optional().describe("Location groups with zones and methods"),
  seller_operations: z.array(z.object({
    product_ids: z.array(z.number()).optional(),
    variant_ids: z.array(z.number()).optional(),
  })).optional().describe("Products/variants to include in this profile"),
});

const UpdateDeliveryProfileSchema = z.object({
  delivery_profile_id: z.string().describe("Delivery profile ID to update"),
  name: z.string().optional().describe("New profile name"),
  seller_operations: z.array(z.object({
    product_ids: z.array(z.number()).optional(),
    variant_ids: z.array(z.number()).optional(),
  })).optional().describe("Products/variants to add/remove"),
});

const DeleteDeliveryProfileSchema = z.object({
  delivery_profile_id: z.string().describe("Delivery profile ID to delete"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_delivery_profiles",
      title: "List Delivery Profiles",
      description: "List all Shopify delivery profiles. Delivery profiles define shipping zones, rates, and which products use which shipping rules. Returns profile names, types, and location group counts.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_delivery_profile",
      title: "Get Delivery Profile",
      description: "Get a single delivery profile by ID. Returns full profile including location groups, zones, and shipping method definitions.",
      inputSchema: {
        type: "object",
        properties: { delivery_profile_id: { type: "string", description: "Delivery profile ID" } },
        required: ["delivery_profile_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_delivery_profile",
      title: "Create Delivery Profile",
      description: "Create a new delivery profile with shipping zones, location groups, and rate definitions. Assign specific products/variants to this profile for custom shipping rates.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Profile name" },
          location_groups: { type: "array", description: "Location groups with zones and methods" },
          seller_operations: { type: "array", description: "Products/variants to assign" },
        },
        required: ["name"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_delivery_profile",
      title: "Update Delivery Profile",
      description: "Update a delivery profile name or assign/remove products and variants from the profile.",
      inputSchema: {
        type: "object",
        properties: {
          delivery_profile_id: { type: "string", description: "Delivery profile ID" },
          name: { type: "string", description: "New profile name" },
          seller_operations: { type: "array", description: "Products/variants to add/remove" },
        },
        required: ["delivery_profile_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_delivery_profile",
      title: "Delete Delivery Profile",
      description: "Delete a delivery profile. Products assigned to this profile will move to the default profile.",
      inputSchema: {
        type: "object",
        properties: { delivery_profile_id: { type: "string", description: "Delivery profile ID" } },
        required: ["delivery_profile_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_delivery_profiles: async (args) => {
      const params = ListDeliveryProfilesSchema.parse(args);
      const result = await logger.time("tool.list_delivery_profiles", () =>
        client.paginatedGet<ShopifyDeliveryProfile>("/delivery_profiles.json", {}, params.limit)
      , { tool: "list_delivery_profiles" });
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_delivery_profile: async (args) => {
      const { delivery_profile_id } = GetDeliveryProfileSchema.parse(args);
      const data = await logger.time("tool.get_delivery_profile", () =>
        client.get<{ delivery_profile: ShopifyDeliveryProfile }>(`/delivery_profiles/${delivery_profile_id}.json`)
      , { tool: "get_delivery_profile" });
      const profile = (data as { delivery_profile: ShopifyDeliveryProfile }).delivery_profile;
      return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }], structuredContent: profile as Record<string, unknown> };
    },

    create_delivery_profile: async (args) => {
      const params = CreateDeliveryProfileSchema.parse(args);
      const data = await logger.time("tool.create_delivery_profile", () =>
        client.post<{ delivery_profile: ShopifyDeliveryProfile }>("/delivery_profiles.json", { delivery_profile: params })
      , { tool: "create_delivery_profile" });
      const profile = (data as { delivery_profile: ShopifyDeliveryProfile }).delivery_profile;
      return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }], structuredContent: profile as Record<string, unknown> };
    },

    update_delivery_profile: async (args) => {
      const { delivery_profile_id, ...updateData } = UpdateDeliveryProfileSchema.parse(args);
      const data = await logger.time("tool.update_delivery_profile", () =>
        client.put<{ delivery_profile: ShopifyDeliveryProfile }>(`/delivery_profiles/${delivery_profile_id}.json`, { delivery_profile: updateData })
      , { tool: "update_delivery_profile" });
      const profile = (data as { delivery_profile: ShopifyDeliveryProfile }).delivery_profile;
      return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }], structuredContent: profile as Record<string, unknown> };
    },

    delete_delivery_profile: async (args) => {
      const { delivery_profile_id } = DeleteDeliveryProfileSchema.parse(args);
      await logger.time("tool.delete_delivery_profile", () =>
        client.delete(`/delivery_profiles/${delivery_profile_id}.json`)
      , { tool: "delete_delivery_profile" });
      const result = { success: true, deleted_id: delivery_profile_id };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
