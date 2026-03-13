// Products tools — Shopify Admin API 2024-01
// Covers: list_products, get_product, create_product, update_product

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler, ShopifyProduct, ShopifyVariant, ShopifyImage } from "../types.js";
import { logger } from "../logger.js";

// === Zod Schemas ===
const ListProductsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  status: z.enum(["active", "archived", "draft"]).optional().describe("Filter by product status"),
  vendor: z.string().optional().describe("Filter by vendor name"),
  product_type: z.string().optional().describe("Filter by product type"),
  collection_id: z.string().optional().describe("Filter products by collection ID"),
  title: z.string().optional().describe("Filter by title (partial match)"),
  page_info: z.string().optional().describe("Cursor for next page (from previous response nextPageInfo)"),
});

const GetProductSchema = z.object({
  product_id: z.string().describe("Shopify product ID"),
});

const CreateProductSchema = z.object({
  title: z.string().describe("Product title (required)"),
  body_html: z.string().optional().describe("Product description (HTML allowed)"),
  vendor: z.string().optional().describe("Vendor/brand name"),
  product_type: z.string().optional().describe("Product type/category"),
  status: z.enum(["active", "draft", "archived"]).optional().default("draft").describe("Product status (default: draft)"),
  tags: z.string().optional().describe("Comma-separated tags"),
  variants: z.array(z.object({
    title: z.string().optional(),
    price: z.string().describe("Variant price"),
    sku: z.string().optional(),
    inventory_quantity: z.number().optional(),
    compare_at_price: z.string().optional(),
    weight: z.number().optional(),
    weight_unit: z.enum(["g", "kg", "oz", "lb"]).optional(),
  })).optional().describe("Product variants (default: one variant with same price)"),
  images: z.array(z.object({
    src: z.string().describe("Image URL"),
    alt: z.string().optional().describe("Alt text"),
  })).optional().describe("Product images"),
});

const DeleteProductSchema = z.object({
  product_id: z.string().describe("Shopify product ID to permanently delete"),
});

const AddProductImageSchema = z.object({
  product_id: z.string().describe("Shopify product ID"),
  src: z.string().url().describe("Public URL of the image to attach"),
  alt: z.string().optional().describe("Alt text for the image"),
  position: z.number().optional().describe("Position/order of the image (1-indexed)"),
  variant_ids: z.array(z.number()).optional().describe("Variant IDs to associate the image with"),
});

const ListProductVariantsSchema = z.object({
  product_id: z.string().describe("Shopify product ID"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page (from previous response nextPageInfo)"),
});

const UpdateProductSchema = z.object({
  product_id: z.string().describe("Shopify product ID"),
  title: z.string().optional().describe("Updated product title"),
  body_html: z.string().optional().describe("Updated description (HTML)"),
  vendor: z.string().optional().describe("Updated vendor"),
  product_type: z.string().optional().describe("Updated product type"),
  status: z.enum(["active", "draft", "archived"]).optional().describe("Update status (use 'active' to publish, 'draft' to unpublish)"),
  tags: z.string().optional().describe("Updated comma-separated tags"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_products",
      title: "List Products",
      description:
        "List Shopify products with optional filters. Returns title, status, vendor, product_type, variants, and images. Supports cursor-based pagination via nextPageInfo. Use when browsing or filtering the product catalog. For a specific product by ID, use get_product instead.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          status: { type: "string", enum: ["active", "archived", "draft"], description: "Filter by product status" },
          vendor: { type: "string", description: "Filter by vendor name" },
          product_type: { type: "string", description: "Filter by product type" },
          collection_id: { type: "string", description: "Filter products by collection ID" },
          title: { type: "string", description: "Filter by title (partial match)" },
          page_info: { type: "string", description: "Cursor for next page (from previous response nextPageInfo)" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                title: { type: "string" },
                status: { type: "string" },
                vendor: { type: "string" },
                product_type: { type: "string" },
                variants: { type: "array" },
                images: { type: "array" },
                created_at: { type: "string" },
              },
            },
          },
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
      name: "get_product",
      title: "Get Product",
      description:
        "Get full details for a Shopify product by ID, including all variants with pricing and inventory, and all images. Use when the user references a specific product ID or needs complete product info. Do NOT use to browse multiple products (use list_products).",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Shopify product ID" },
        },
        required: ["product_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          title: { type: "string" },
          status: { type: "string" },
          vendor: { type: "string" },
          product_type: { type: "string" },
          body_html: { type: "string" },
          variants: { type: "array" },
          images: { type: "array" },
          tags: { type: "string" },
        },
        required: ["id", "title"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "create_product",
      title: "Create Product",
      description:
        "Create a new Shopify product with optional variants and images. Default status is 'draft'. Returns the created product with assigned ID and variant IDs. Use when the user wants to add a new product to the store.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Product title (required)" },
          body_html: { type: "string", description: "Product description (HTML allowed)" },
          vendor: { type: "string", description: "Vendor/brand name" },
          product_type: { type: "string", description: "Product type/category" },
          status: { type: "string", enum: ["active", "draft", "archived"], description: "Product status (default: draft)" },
          tags: { type: "string", description: "Comma-separated tags" },
          variants: {
            type: "array",
            description: "Product variants",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                price: { type: "string" },
                sku: { type: "string" },
                inventory_quantity: { type: "number" },
                compare_at_price: { type: "string" },
              },
            },
          },
          images: {
            type: "array",
            description: "Product images",
            items: {
              type: "object",
              properties: {
                src: { type: "string" },
                alt: { type: "string" },
              },
            },
          },
        },
        required: ["title"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          title: { type: "string" },
          status: { type: "string" },
          variants: { type: "array" },
        },
        required: ["id", "title"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "update_product",
      title: "Update Product",
      description:
        "Update an existing Shopify product's fields. Only include fields to change. Use status='active' to publish or status='draft' to unpublish. Returns the updated product.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Shopify product ID" },
          title: { type: "string", description: "Updated product title" },
          body_html: { type: "string", description: "Updated description (HTML)" },
          vendor: { type: "string", description: "Updated vendor" },
          product_type: { type: "string", description: "Updated product type" },
          status: { type: "string", enum: ["active", "draft", "archived"], description: "Update status ('active' to publish, 'draft' to unpublish)" },
          tags: { type: "string", description: "Updated comma-separated tags" },
        },
        required: ["product_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          title: { type: "string" },
          status: { type: "string" },
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
      name: "delete_product",
      title: "Delete Product",
      description:
        "Permanently delete a Shopify product and all its variants, images, and metafields. This action cannot be undone. Use with caution — confirm product ID before deleting.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Shopify product ID to permanently delete" },
        },
        required: ["product_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          product_id: { type: "string" },
        },
        required: ["success"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "add_product_image",
      title: "Add Product Image",
      description:
        "Add an image to a Shopify product from a public URL. Optionally assign it to specific variants and set its position in the image gallery. Returns the created product image with Shopify-assigned ID.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Shopify product ID" },
          src: { type: "string", description: "Public URL of the image" },
          alt: { type: "string", description: "Alt text" },
          position: { type: "number", description: "Image position (1-indexed)" },
          variant_ids: { type: "array", items: { type: "number" }, description: "Variant IDs to associate" },
        },
        required: ["product_id", "src"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          product_id: { type: "number" },
          src: { type: "string" },
          alt: { type: "string" },
          position: { type: "number" },
          created_at: { type: "string" },
        },
        required: ["id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "list_product_variants",
      title: "List Product Variants",
      description:
        "List all variants for a specific Shopify product. Returns price, SKU, inventory quantity, inventory_item_id, and option values for each variant. Supports cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Shopify product ID" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
        },
        required: ["product_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: { count: { type: "number" }, hasMore: { type: "boolean" }, nextPageInfo: { type: "string" } },
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
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_products: async (args) => {
      const params = ListProductsSchema.parse(args);

      let result: { data: ShopifyProduct[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_products", () =>
          client.paginateFromCursor<ShopifyProduct>("/products.json", params.page_info!, params.limit)
        , { tool: "list_products" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.status) extraParams.status = params.status;
        if (params.vendor) extraParams.vendor = params.vendor;
        if (params.product_type) extraParams.product_type = params.product_type;
        if (params.collection_id) extraParams.collection_id = params.collection_id;
        if (params.title) extraParams.title = params.title;

        result = await logger.time("tool.list_products", () =>
          client.paginatedGet<ShopifyProduct>("/products.json", extraParams, params.limit)
        , { tool: "list_products" });
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

    get_product: async (args) => {
      const { product_id } = GetProductSchema.parse(args);
      const data = await logger.time("tool.get_product", () =>
        client.get<{ product: ShopifyProduct }>(`/products/${product_id}.json`)
      , { tool: "get_product", product_id });

      const product = (data as { product: ShopifyProduct }).product;

      return {
        content: [{ type: "text", text: JSON.stringify(product, null, 2) }],
        structuredContent: product,
      };
    },

    create_product: async (args) => {
      const params = CreateProductSchema.parse(args);
      const data = await logger.time("tool.create_product", () =>
        client.post<{ product: ShopifyProduct }>("/products.json", { product: params })
      , { tool: "create_product" });

      const product = (data as { product: ShopifyProduct }).product;

      return {
        content: [{ type: "text", text: JSON.stringify(product, null, 2) }],
        structuredContent: product,
      };
    },

    update_product: async (args) => {
      const { product_id, ...updateData } = UpdateProductSchema.parse(args);
      const data = await logger.time("tool.update_product", () =>
        client.put<{ product: ShopifyProduct }>(`/products/${product_id}.json`, { product: updateData })
      , { tool: "update_product", product_id });

      const product = (data as { product: ShopifyProduct }).product;

      return {
        content: [{ type: "text", text: JSON.stringify(product, null, 2) }],
        structuredContent: product,
      };
    },

    delete_product: async (args) => {
      const { product_id } = DeleteProductSchema.parse(args);
      await logger.time("tool.delete_product", () =>
        client.delete<unknown>(`/products/${product_id}.json`)
      , { tool: "delete_product", product_id });

      const response = { success: true, product_id };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    add_product_image: async (args) => {
      const { product_id, ...imageData } = AddProductImageSchema.parse(args);
      const data = await logger.time("tool.add_product_image", () =>
        client.post<{ image: ShopifyImage }>(`/products/${product_id}/images.json`, { image: imageData })
      , { tool: "add_product_image", product_id });

      const image = (data as { image: ShopifyImage }).image;

      return {
        content: [{ type: "text", text: JSON.stringify(image, null, 2) }],
        structuredContent: image,
      };
    },

    list_product_variants: async (args) => {
      const params = ListProductVariantsSchema.parse(args);
      let result: { data: ShopifyVariant[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_product_variants", () =>
          client.paginateFromCursor<ShopifyVariant>(
            `/products/${params.product_id}/variants.json`,
            params.page_info!,
            params.limit
          )
        , { tool: "list_product_variants" });
      } else {
        result = await logger.time("tool.list_product_variants", () =>
          client.paginatedGet<ShopifyVariant>(
            `/products/${params.product_id}/variants.json`,
            {},
            params.limit
          )
        , { tool: "list_product_variants" });
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
  };
}

export function getTools(client: ShopifyClient) {
  return {
    tools: getToolDefinitions(),
    handlers: getToolHandlers(client),
  };
}
