// Product Variants tools — Shopify Admin API 2024-01
// Covers: get_variant, create_variant, update_variant, delete_variant

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler, ShopifyVariant } from "../types.js";
import { logger } from "../logger.js";

// === Zod Schemas ===
const GetVariantSchema = z.object({
  variant_id: z.string().describe("Shopify variant ID"),
});

const CreateVariantSchema = z.object({
  product_id: z.string().describe("Product to add the variant to"),
  title: z.string().optional().describe("Variant title (auto-generated from options if omitted)"),
  price: z.string().describe("Variant price (e.g. '19.99')"),
  compare_at_price: z.string().optional().nullable().describe("Compare-at (original) price"),
  sku: z.string().optional().describe("SKU for inventory tracking"),
  barcode: z.string().optional().describe("Barcode (ISBN, UPC, GTIN)"),
  weight: z.number().optional().describe("Variant weight"),
  weight_unit: z.enum(["g", "kg", "oz", "lb"]).optional(),
  inventory_management: z.string().optional().nullable().describe("'shopify' to enable inventory tracking, null to disable"),
  inventory_policy: z.enum(["deny", "continue"]).optional().describe("What to do when out of stock"),
  inventory_quantity: z.number().optional().describe("Initial inventory quantity"),
  option1: z.string().optional().describe("Value for option 1 (e.g. 'Red')"),
  option2: z.string().optional().describe("Value for option 2 (e.g. 'Large')"),
  option3: z.string().optional().describe("Value for option 3"),
  requires_shipping: z.boolean().optional(),
  taxable: z.boolean().optional(),
  tax_code: z.string().optional(),
  fulfillment_service: z.string().optional().default("manual"),
  image_id: z.number().optional().describe("ID of product image to assign to this variant"),
});

const UpdateVariantSchema = z.object({
  variant_id: z.string(),
  price: z.string().optional(),
  compare_at_price: z.string().optional().nullable(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  weight: z.number().optional(),
  weight_unit: z.enum(["g", "kg", "oz", "lb"]).optional(),
  inventory_management: z.string().optional().nullable(),
  inventory_policy: z.enum(["deny", "continue"]).optional(),
  option1: z.string().optional(),
  option2: z.string().optional(),
  option3: z.string().optional(),
  requires_shipping: z.boolean().optional(),
  taxable: z.boolean().optional(),
  image_id: z.number().optional().nullable(),
});

const DeleteVariantSchema = z.object({
  product_id: z.string(),
  variant_id: z.string(),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_variant",
      title: "Get Product Variant",
      description: "Get full details for a specific product variant by its variant ID. Returns price, SKU, inventory, weight, options, and inventory_item_id.",
      inputSchema: {
        type: "object",
        properties: { variant_id: { type: "string", description: "Shopify variant ID" } },
        required: ["variant_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_variant",
      title: "Create Product Variant",
      description: "Add a new variant to an existing Shopify product. Set price, SKU, weight, options (size/color/etc.), and inventory settings. The product must already exist.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          title: { type: "string" },
          price: { type: "string" },
          compare_at_price: { type: "string" },
          sku: { type: "string" },
          barcode: { type: "string" },
          weight: { type: "number" },
          weight_unit: { type: "string", enum: ["g", "kg", "oz", "lb"] },
          inventory_management: { type: "string" },
          inventory_policy: { type: "string", enum: ["deny", "continue"] },
          inventory_quantity: { type: "number" },
          option1: { type: "string" },
          option2: { type: "string" },
          option3: { type: "string" },
          requires_shipping: { type: "boolean" },
          taxable: { type: "boolean" },
          fulfillment_service: { type: "string" },
          image_id: { type: "number" },
        },
        required: ["product_id", "price"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_variant",
      title: "Update Product Variant",
      description: "Update an existing product variant's price, SKU, weight, options, or inventory settings. Only include fields you want to change.",
      inputSchema: {
        type: "object",
        properties: {
          variant_id: { type: "string" },
          price: { type: "string" },
          compare_at_price: { type: "string" },
          sku: { type: "string" },
          barcode: { type: "string" },
          weight: { type: "number" },
          weight_unit: { type: "string" },
          inventory_management: { type: "string" },
          inventory_policy: { type: "string" },
          option1: { type: "string" },
          option2: { type: "string" },
          option3: { type: "string" },
          requires_shipping: { type: "boolean" },
          taxable: { type: "boolean" },
          image_id: { type: "number" },
        },
        required: ["variant_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_variant",
      title: "Delete Product Variant",
      description: "Permanently delete a variant from a product. The product must have at least one other variant. Cannot be undone.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          variant_id: { type: "string" },
        },
        required: ["product_id", "variant_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    get_variant: async (args) => {
      const { variant_id } = GetVariantSchema.parse(args);
      const data = await logger.time("tool.get_variant", () =>
        client.get<{ variant: ShopifyVariant }>(`/variants/${variant_id}.json`)
      , { tool: "get_variant" });
      const variant = (data as { variant: ShopifyVariant }).variant;
      return { content: [{ type: "text", text: JSON.stringify(variant, null, 2) }], structuredContent: variant };
    },

    create_variant: async (args) => {
      const { product_id, ...variantData } = CreateVariantSchema.parse(args);
      const data = await logger.time("tool.create_variant", () =>
        client.post<{ variant: ShopifyVariant }>(`/products/${product_id}/variants.json`, { variant: variantData })
      , { tool: "create_variant" });
      const variant = (data as { variant: ShopifyVariant }).variant;
      return { content: [{ type: "text", text: JSON.stringify(variant, null, 2) }], structuredContent: variant };
    },

    update_variant: async (args) => {
      const { variant_id, ...updateData } = UpdateVariantSchema.parse(args);
      const data = await logger.time("tool.update_variant", () =>
        client.put<{ variant: ShopifyVariant }>(`/variants/${variant_id}.json`, { variant: updateData })
      , { tool: "update_variant" });
      const variant = (data as { variant: ShopifyVariant }).variant;
      return { content: [{ type: "text", text: JSON.stringify(variant, null, 2) }], structuredContent: variant };
    },

    delete_variant: async (args) => {
      const { product_id, variant_id } = DeleteVariantSchema.parse(args);
      await logger.time("tool.delete_variant", () =>
        client.delete<unknown>(`/products/${product_id}/variants/${variant_id}.json`)
      , { tool: "delete_variant" });
      const response = { success: true, variant_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
