// Order Editing tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: order_edit_begin, order_edit_add_line_item_discount, order_edit_add_variant, order_edit_remove_line_item_discount, order_edit_set_quantity, order_edit_commit

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const BeginEditSchema = z.object({
  orderId: z.string().describe("GID of the order to begin editing (e.g. gid://shopify/Order/123)"),
});

const AddVariantSchema = z.object({
  id: z.string().describe("Order edit calculation ID from begin_order_edit response"),
  variantId: z.string().describe("GID of the variant to add (e.g. gid://shopify/ProductVariant/123)"),
  quantity: z.number().min(1).describe("Quantity to add"),
  allowDuplicates: z.boolean().optional().default(false).describe("Allow adding a variant already in the order"),
});

const SetQuantitySchema = z.object({
  id: z.string().describe("Order edit calculation ID"),
  lineItemId: z.string().describe("GID of the line item to update quantity"),
  quantity: z.number().min(0).describe("New quantity (0 to remove)"),
  restock: z.boolean().optional().default(false).describe("Restock inventory when reducing quantity"),
});

const AddDiscountSchema = z.object({
  id: z.string().describe("Order edit calculation ID"),
  lineItemId: z.string().describe("GID of the line item to add discount"),
  discount: z.object({
    description: z.string().describe("Discount description"),
    fixedValue: z.object({
      amount: z.string().optional().describe("Fixed amount"),
      currencyCode: z.string().optional().describe("Currency code"),
    }).optional().describe("Fixed amount discount"),
    percentValue: z.number().optional().describe("Percentage discount (0-100)"),
  }).describe("Discount to apply"),
});

const RemoveDiscountSchema = z.object({
  id: z.string().describe("Order edit calculation ID"),
  discountApplicationId: z.string().describe("GID of the discount application to remove"),
});

const CommitEditSchema = z.object({
  id: z.string().describe("Order edit calculation ID"),
  notifyCustomer: z.boolean().optional().default(false).describe("Send notification email to customer about changes"),
  staffNote: z.string().optional().describe("Internal staff note for the edit"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "begin_order_edit",
      title: "Begin Order Edit",
      description: "Start an order edit session. Returns a calculation ID used for all subsequent edit operations. The order edit is staged until committed. Changes are visible only after commit_order_edit.",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string", description: "Order GID (e.g. gid://shopify/Order/123)" } },
        required: ["orderId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "order_edit_add_variant",
      title: "Add Variant to Order Edit",
      description: "Add a product variant to a staged order edit. Returns updated calculated order with new line item. Must call commit_order_edit to finalize.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order edit calculation ID" },
          variantId: { type: "string", description: "Variant GID to add" },
          quantity: { type: "number", description: "Quantity to add" },
          allowDuplicates: { type: "boolean", description: "Allow adding already-present variant" },
        },
        required: ["id", "variantId", "quantity"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "order_edit_set_quantity",
      title: "Set Line Item Quantity in Order Edit",
      description: "Change the quantity of a line item in a staged order edit. Set to 0 to remove the line item. Must call commit_order_edit to finalize.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order edit calculation ID" },
          lineItemId: { type: "string", description: "Line item GID" },
          quantity: { type: "number", description: "New quantity (0 to remove)" },
          restock: { type: "boolean", description: "Restock inventory when reducing" },
        },
        required: ["id", "lineItemId", "quantity"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "order_edit_add_line_item_discount",
      title: "Add Discount to Line Item in Order Edit",
      description: "Apply a discount (fixed amount or percentage) to a specific line item in a staged order edit. Must call commit_order_edit to finalize.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order edit calculation ID" },
          lineItemId: { type: "string", description: "Line item GID" },
          discount: { type: "object", description: "Discount object with description and fixedValue or percentValue" },
        },
        required: ["id", "lineItemId", "discount"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "order_edit_remove_line_item_discount",
      title: "Remove Discount from Line Item in Order Edit",
      description: "Remove a previously staged discount from a line item in an order edit. Must call commit_order_edit to finalize.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order edit calculation ID" },
          discountApplicationId: { type: "string", description: "Discount application GID to remove" },
        },
        required: ["id", "discountApplicationId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "commit_order_edit",
      title: "Commit Order Edit",
      description: "Finalize and apply all staged order edit changes. Optionally notify the customer by email. Returns the updated order. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order edit calculation ID" },
          notifyCustomer: { type: "boolean", description: "Send notification email to customer" },
          staffNote: { type: "string", description: "Internal note for the edit" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    begin_order_edit: async (args) => {
      const { orderId } = BeginEditSchema.parse(args);
      const query = `
        mutation orderEditBegin($id: ID!) {
          orderEditBegin(id: $id) {
            calculatedOrder {
              id
              order { id name }
              lineItems(first: 50) {
                edges { node { id quantity originalUnitPrice { amount currencyCode } } }
              }
            }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.begin_order_edit", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id: orderId } })
      , { tool: "begin_order_edit" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    order_edit_add_variant: async (args) => {
      const { id, variantId, quantity, allowDuplicates } = AddVariantSchema.parse(args);
      const query = `
        mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!, $allowDuplicates: Boolean) {
          orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity, allowDuplicates: $allowDuplicates) {
            calculatedLineItem { id quantity originalUnitPrice { amount currencyCode } }
            calculatedOrder { totalPriceSet { shopMoney { amount currencyCode } } }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.order_edit_add_variant", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { id, variantId, quantity, allowDuplicates },
        })
      , { tool: "order_edit_add_variant" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    order_edit_set_quantity: async (args) => {
      const { id, lineItemId, quantity, restock } = SetQuantitySchema.parse(args);
      const query = `
        mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) {
            calculatedLineItem { id quantity }
            calculatedOrder { totalPriceSet { shopMoney { amount } } }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.order_edit_set_quantity", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { id, lineItemId, quantity, restock },
        })
      , { tool: "order_edit_set_quantity" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    order_edit_add_line_item_discount: async (args) => {
      const { id, lineItemId, discount } = AddDiscountSchema.parse(args);
      const query = `
        mutation orderEditAddLineItemDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
          orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
            discountApplication { id }
            calculatedOrder { totalPriceSet { shopMoney { amount } } }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.order_edit_add_line_item_discount", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { id, lineItemId, discount },
        })
      , { tool: "order_edit_add_line_item_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    order_edit_remove_line_item_discount: async (args) => {
      const { id, discountApplicationId } = RemoveDiscountSchema.parse(args);
      const query = `
        mutation orderEditRemoveLineItemDiscount($id: ID!, $discountApplicationId: ID!) {
          orderEditRemoveLineItemDiscount(id: $id, discountApplicationId: $discountApplicationId) {
            calculatedOrder { id totalPriceSet { shopMoney { amount } } }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.order_edit_remove_line_item_discount", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { id, discountApplicationId },
        })
      , { tool: "order_edit_remove_line_item_discount" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    commit_order_edit: async (args) => {
      const { id, notifyCustomer, staffNote } = CommitEditSchema.parse(args);
      const query = `
        mutation orderEditCommit($id: ID!, $notifyCustomer: Boolean, $staffNote: String) {
          orderEditCommit(id: $id, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
            order { id name totalPriceSet { shopMoney { amount currencyCode } } }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.commit_order_edit", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { id, notifyCustomer, staffNote },
        })
      , { tool: "commit_order_edit" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
