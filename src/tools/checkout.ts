// Checkout tools — Shopify Admin API 2024-01
// Covers: create_checkout, complete_checkout, get_checkout, list_checkout_shipping_rates, update_checkout

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyCheckout {
  token?: string;
  cart_token?: string;
  email?: string | null;
  gateway?: string | null;
  buyer_accepts_marketing?: boolean;
  created_at?: string;
  currency?: string;
  completed_at?: string | null;
  line_items?: unknown[];
  subtotal_price?: string;
  total_price?: string;
  total_tax?: string;
  shipping_address?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  shipping_line?: Record<string, unknown> | null;
  payment_url?: string;
  web_url?: string;
}

interface ShopifyShippingRate {
  id?: string;
  price?: string;
  title?: string;
  checkout?: ShopifyCheckout;
}

const CreateCheckoutSchema = z.object({
  email: z.string().email().optional().describe("Customer email"),
  line_items: z.array(z.object({
    variant_id: z.number().optional().describe("Variant ID"),
    quantity: z.number().describe("Quantity"),
    price: z.string().optional().describe("Override price"),
  })).describe("Line items for the checkout"),
  shipping_address: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    address1: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
  }).optional().describe("Shipping address"),
  billing_address: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    address1: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
  }).optional().describe("Billing address"),
  discount_code: z.string().optional().describe("Discount code to apply"),
  note: z.string().optional().describe("Order note"),
});

const GetCheckoutSchema = z.object({
  token: z.string().describe("Checkout token"),
});

const UpdateCheckoutSchema = z.object({
  token: z.string().describe("Checkout token"),
  email: z.string().email().optional().describe("Customer email"),
  shipping_line: z.object({
    handle: z.string().describe("Shipping rate handle from list_checkout_shipping_rates"),
  }).optional().describe("Shipping line to apply"),
  discount_code: z.string().optional().describe("Discount code to apply"),
  note: z.string().optional().describe("Order note"),
});

const ListShippingRatesSchema = z.object({
  token: z.string().describe("Checkout token"),
});

const CompleteCheckoutSchema = z.object({
  token: z.string().describe("Checkout token"),
  payment: z.object({
    amount: z.string().describe("Payment amount"),
    session_id: z.string().optional().describe("Payment session ID"),
    payment_token: z.object({
      payment_data: z.string().describe("Encrypted payment data"),
      type: z.string().optional().describe("Payment token type"),
    }).optional().describe("Payment token for gateway"),
  }).optional().describe("Payment details"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "create_checkout",
      title: "Create Checkout",
      description: "Create a new Shopify checkout with line items, shipping and billing addresses. Returns a checkout token and payment URL for completing the purchase.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Customer email" },
          line_items: { type: "array", description: "Array of {variant_id, quantity} objects" },
          shipping_address: { type: "object", description: "Shipping address object" },
          billing_address: { type: "object", description: "Billing address object" },
          discount_code: { type: "string", description: "Discount code to apply" },
          note: { type: "string", description: "Order note" },
        },
        required: ["line_items"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "get_checkout",
      title: "Get Checkout",
      description: "Retrieve a checkout by token. Returns current line items, addresses, shipping line, pricing totals, and payment URL.",
      inputSchema: {
        type: "object",
        properties: { token: { type: "string", description: "Checkout token" } },
        required: ["token"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "update_checkout",
      title: "Update Checkout",
      description: "Update a checkout — set email, apply a shipping rate (from list_checkout_shipping_rates), or update discount code.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Checkout token" },
          email: { type: "string", description: "Customer email" },
          shipping_line: { type: "object", description: "Shipping line with handle" },
          discount_code: { type: "string", description: "Discount code" },
          note: { type: "string", description: "Order note" },
        },
        required: ["token"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_checkout_shipping_rates",
      title: "List Checkout Shipping Rates",
      description: "Get available shipping rates for a checkout. Returns rate handles, titles, and prices. Apply a rate via update_checkout with the handle.",
      inputSchema: {
        type: "object",
        properties: { token: { type: "string", description: "Checkout token" } },
        required: ["token"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "complete_checkout",
      title: "Complete Checkout",
      description: "Mark a checkout as complete. For checkouts using external payment sessions, pass the payment details. Returns the completed checkout with order information.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Checkout token" },
          payment: { type: "object", description: "Payment details (amount, session_id, payment_token)" },
        },
        required: ["token"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    create_checkout: async (args) => {
      const params = CreateCheckoutSchema.parse(args);
      const data = await logger.time("tool.create_checkout", () =>
        client.post<{ checkout: ShopifyCheckout }>("/checkouts.json", { checkout: params })
      , { tool: "create_checkout" });
      const checkout = (data as { checkout: ShopifyCheckout }).checkout;
      return { content: [{ type: "text", text: JSON.stringify(checkout, null, 2) }], structuredContent: checkout as Record<string, unknown> };
    },

    get_checkout: async (args) => {
      const { token } = GetCheckoutSchema.parse(args);
      const data = await logger.time("tool.get_checkout", () =>
        client.get<{ checkout: ShopifyCheckout }>(`/checkouts/${token}.json`)
      , { tool: "get_checkout" });
      const checkout = (data as { checkout: ShopifyCheckout }).checkout;
      return { content: [{ type: "text", text: JSON.stringify(checkout, null, 2) }], structuredContent: checkout as Record<string, unknown> };
    },

    update_checkout: async (args) => {
      const { token, ...updateData } = UpdateCheckoutSchema.parse(args);
      const data = await logger.time("tool.update_checkout", () =>
        client.put<{ checkout: ShopifyCheckout }>(`/checkouts/${token}.json`, { checkout: updateData })
      , { tool: "update_checkout" });
      const checkout = (data as { checkout: ShopifyCheckout }).checkout;
      return { content: [{ type: "text", text: JSON.stringify(checkout, null, 2) }], structuredContent: checkout as Record<string, unknown> };
    },

    list_checkout_shipping_rates: async (args) => {
      const { token } = ListShippingRatesSchema.parse(args);
      const data = await logger.time("tool.list_checkout_shipping_rates", () =>
        client.get<{ shipping_rates: ShopifyShippingRate[] }>(`/checkouts/${token}/shipping_rates.json`)
      , { tool: "list_checkout_shipping_rates" });
      const rates = (data as { shipping_rates: ShopifyShippingRate[] }).shipping_rates;
      const response = { data: rates, meta: { count: rates.length } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    complete_checkout: async (args) => {
      const { token, payment } = CompleteCheckoutSchema.parse(args);
      const body: Record<string, unknown> = {};
      if (payment) body.payment = payment;
      const data = await logger.time("tool.complete_checkout", () =>
        client.post<{ checkout: ShopifyCheckout }>(`/checkouts/${token}/complete.json`, body)
      , { tool: "complete_checkout" });
      const checkout = (data as { checkout: ShopifyCheckout }).checkout;
      return { content: [{ type: "text", text: JSON.stringify(checkout, null, 2) }], structuredContent: checkout as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
